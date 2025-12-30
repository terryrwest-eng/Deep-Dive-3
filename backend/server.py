from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import aiofiles
import PyPDF2
import io
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create upload directories
PRO_UPLOAD_DIR = ROOT_DIR / "pro_uploads"
PRO_UPLOAD_DIR.mkdir(exist_ok=True)

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()

# Gemini Files/Content API endpoints
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
GEMINI_FILES_UPLOAD_URL = f"{GEMINI_BASE_URL}/upload/v1beta/files"
GEMINI_FILES_URL = f"{GEMINI_BASE_URL}/v1beta/files"

# Pro scan constraints
GEMINI_FILE_MAX_PAGES = 1000
GEMINI_FILE_MAX_SIZE_MB = 45  # Gemini limit is 50MB, use 45MB for safety
PRO_TOKEN_SAFETY_LIMIT = 1_900_000
TOKENS_PER_PAGE_ESTIMATE = 1000  # rough heuristic used to trigger batch mode
BATCH_OVERLAP_PAGES = 50
BATCH_TARGET_PAGES = 2000

api_router = APIRouter(prefix="/api")

# Define Models (Existing)
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Define Models (Deep Dive)
class AnalyzeRequest(BaseModel):
    document_ids: List[str]
    query: str
    model: str = "gemini-2.5-flash"  # Default model
    speed: str = "balanced"  # thorough, balanced, fast
    page_start: Optional[int] = None  # Start page (1-indexed)
    page_end: Optional[int] = None    # End page (inclusive)
    relevance_mode: str = "normal"  # normal | strict
    rubric_text: Optional[str] = None  # auto-generated, user-editable rubric

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    document_ids: List[str]
    message: str

class RubricRequest(BaseModel):
    query: str
    model: str = "gemini-2.5-flash"

class RubricResponse(BaseModel):
    rubric_text: str
    rubric_json: Optional[dict] = None

class ProUploadInitRequest(BaseModel):
    filename: str
    size_bytes: int

class ProUploadCompleteRequest(BaseModel):
    upload_id: str
    gemini_api_key: str

class ProAnalyzeRequest(BaseModel):
    pro_document_id: str
    query: str
    gemini_api_key: str
    deep_dive: bool = True

class ProChatRequest(BaseModel):
    session_id: Optional[str] = None
    pro_document_id: str
    message: str
    gemini_api_key: str

# Helpers
async def _gemini_request_headers(api_key: str) -> Dict[str, str]:
    return {"x-goog-api-key": api_key}

async def gemini_files_resumable_upload(api_key: str, file_path: Path, display_name: str) -> Dict[str, Any]:
    import aiohttp
    mime_type = "application/pdf"
    size_bytes = file_path.stat().st_size
    async with aiohttp.ClientSession() as session:
        start_headers = {
            **(await _gemini_request_headers(api_key)),
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(size_bytes),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        }
        start_body = {"file": {"display_name": display_name}}
        async with session.post(GEMINI_FILES_UPLOAD_URL, headers=start_headers, json=start_body) as resp:
            if resp.status >= 400:
                raise HTTPException(status_code=500, detail=f"Gemini file upload init failed: {await resp.text()}")
            upload_url = resp.headers.get("x-goog-upload-url") or resp.headers.get("X-Goog-Upload-URL")
            if not upload_url:
                raise HTTPException(status_code=500, detail="Gemini file upload init failed: missing upload URL")
        
        upload_headers = {
            "Content-Length": str(size_bytes),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        }
        with open(file_path, "rb") as f:
            async with session.post(upload_url, headers=upload_headers, data=f) as resp2:
                if resp2.status >= 400:
                    raise HTTPException(status_code=500, detail=f"Gemini file upload finalize failed: {await resp2.text()}")
                payload = await resp2.json()
    return payload.get("file") or payload

async def gemini_files_delete(api_key: str, file_name: str) -> None:
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.delete(f"{GEMINI_FILES_URL}/{file_name}", headers=await _gemini_request_headers(api_key)) as resp:
            if resp.status >= 400:
                raise HTTPException(status_code=500, detail=f"Gemini files.delete failed: {await resp.text()}")

async def gemini_models_list(api_key: str) -> List[Dict[str, Any]]:
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{GEMINI_BASE_URL}/v1beta/models", headers=await _gemini_request_headers(api_key)) as resp:
            data = await resp.json(content_type=None)
            if resp.status >= 400:
                raise HTTPException(status_code=500, detail={"message": "models.list failed", "data": data})
            return data.get('models', [])

async def gemini_select_pro_model(api_key: str, preferred: str = "gemini-1.5-pro", exclude: Optional[List[str]] = None) -> str:
    exclude = exclude or []
    models = await gemini_models_list(api_key)
    def norm(name: str) -> str: return (name or '').replace('models/', '')
    usable = []
    for m in models:
        name = norm(m.get('name', ''))
        methods = m.get('supportedGenerationMethods') or []
        if not name or 'generateContent' not in methods: continue
        if 'flash' in name.lower() or 'pro' not in name.lower(): continue
        if name in exclude: continue
        usable.append(name)
    if preferred and norm(preferred) in usable and norm(preferred) not in exclude:
        return norm(preferred)
    for candidate in ['gemini-2.5-pro', 'gemini-2.0-pro', 'gemini-1.5-pro']:
        c = norm(candidate)
        if c in usable: return c
    if usable: return usable[0]
    all_names = [norm(m.get('name','')) for m in models]
    raise HTTPException(status_code=500, detail={"message": "No Pro models available", "available_models": all_names[:80]})

async def gemini_generate_content_with_files(api_key: str, model_preferred: str, system_instruction: str, user_text: str, file_uris: List[Dict[str, str]]) -> Dict[str, Any]:
    import aiohttp
    def _payload(model: str) -> Dict[str, Any]:
        parts = []
        for fu in file_uris:
            parts.append({"fileData": {"mimeType": fu["mime_type"], "fileUri": fu["file_uri"]}})
        parts.append({"text": user_text})
        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 8192, "responseMimeType": "application/json"},
        }
        if system_instruction and system_instruction.strip():
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        return payload

    async def _call(model: str) -> Dict[str, Any]:
        url = f"{GEMINI_BASE_URL}/v1beta/models/{model}:generateContent"
        payload = _payload(model)
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers={**(await _gemini_request_headers(api_key)), "Content-Type": "application/json"}, json=payload) as resp:
                data = await resp.json(content_type=None)
                if resp.status >= 400: return {"__error__": True, "status": resp.status, "data": data}
                return data

    initial_model = await gemini_select_pro_model(api_key, preferred=model_preferred)
    first = await _call(initial_model)
    if first.get("__error__"):
        fallback_model = await gemini_select_pro_model(api_key, preferred=model_preferred, exclude=[initial_model])
        second = await _call(fallback_model)
        if second.get("__error__"):
            raise HTTPException(status_code=500, detail={"preferred_error": first, "fallback_error": second})
        second["__model_used__"] = fallback_model
        return second
    first["__model_used__"] = initial_model
    return first

def _extract_candidate_json_text(resp: Dict[str, Any]) -> str:
    try:
        parts = resp.get("candidates", [])[0].get("content", {}).get("parts", [])
        text = "".join([p.get("text", "") for p in parts if isinstance(p, dict)])
        return text
    except Exception: return ""

def _safe_parse_json(text: str) -> Any:
    try: return json.loads(text)
    except Exception: return {"raw": text}

def _estimate_tokens_for_pages(total_pages: int) -> int:
    return int(total_pages * TOKENS_PER_PAGE_ESTIMATE)

def _pdf_page_count(file_path: Path) -> int:
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f, strict=False)
        return len(reader.pages)

def _split_pdf_by_pages(src_path: Path, out_dir: Path, max_pages_per_file: int = GEMINI_FILE_MAX_PAGES, max_size_mb: int = GEMINI_FILE_MAX_SIZE_MB) -> List[Dict[str, Any]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    max_size_bytes = max_size_mb * 1024 * 1024
    with open(src_path, "rb") as f:
        reader = PyPDF2.PdfReader(f, strict=False)
        total = len(reader.pages)
        parts = []
        part_idx = 0
        start = 1
        while start <= total:
            writer = PyPDF2.PdfWriter()
            current_page = start
            while current_page <= total and (current_page - start + 1) <= max_pages_per_file:
                writer.add_page(reader.pages[current_page - 1])
                if len(writer.pages) % 50 == 0 or current_page == total:
                    buffer = io.BytesIO()
                    writer.write(buffer)
                    current_size = buffer.tell()
                    if current_size >= max_size_bytes and len(writer.pages) > 1:
                        if current_page > start:
                            current_page -= 1
                            writer = PyPDF2.PdfWriter()
                            for p in range(start - 1, current_page): writer.add_page(reader.pages[p])
                        break
                current_page += 1
            end = current_page if current_page <= total else total
            if len(writer.pages) == 0:
                writer.add_page(reader.pages[start - 1])
                end = start
            part_idx += 1
            out_path = out_dir / f"part_{part_idx}_{start}-{end}.pdf"
            with open(out_path, "wb") as out_f: writer.write(out_f)
            actual_size = out_path.stat().st_size
            parts.append({"part_index": part_idx, "start_page": start, "end_page": end, "local_path": str(out_path), "size_bytes": actual_size})
            start = end + 1
    return parts

def _extract_gemini_error_message(obj: Any) -> str:
    try:
        if isinstance(obj, str): return obj
        if isinstance(obj, dict):
            err = obj.get('error')
            if isinstance(err, dict):
                return err.get('message') or str(err)
            return str(obj.get('message') or str(obj))
        return str(obj)
    except Exception: return "Gemini API unknown error"

def _build_file_uri_parts(parts: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [{"mime_type": "application/pdf", "file_uri": p["gemini_file_uri"]} for p in parts]

def extract_pdf_pages(pdf_content: bytes) -> List[dict]:
    pages = []
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
        for page_num, page in enumerate(pdf_reader.pages, 1):
            text = page.extract_text() or ""
            pages.append({"page_number": page_num, "text": text, "word_count": len(text.split()), "char_count": len(text)})
    except Exception as e:
        logging.error(f"PDF extraction error: {e}")
    return pages

async def generate_query_rubric(query: str, model: str = "gemini-2.5-flash") -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key: return {"rubric_text": "", "rubric_json": None, "error": "EMERGENT_LLM_KEY not configured"}
    model_map = {
        "gpt-5.2": ("openai", "gpt-5.2"),
        "gpt-4o": ("openai", "gpt-4o"),
        "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
        "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
        "claude-sonnet-4.5": ("anthropic", "claude-sonnet-4-20250514"),
    }
    provider, model_name = model_map.get(model, ("gemini", "gemini-2.5-flash"))
    chat = LlmChat(
        api_key=api_key,
        session_id=f"rubric-{uuid.uuid4()}",
        system_message="""You convert a user's natural-language search request into a GENERAL-PURPOSE relevance rubric.
Return STRICT JSON: { "rubric_text": "...", "rubric_json": {...} }"""
    ).with_model(provider, model_name)
    resp = await chat.send_message(UserMessage(text=f"User query:\n{query}"))
    json_start = resp.find('{')
    json_end = resp.rfind('}') + 1
    if json_start < 0 or json_end <= json_start: return {"rubric_text": "", "rubric_json": None, "error": "Could not parse rubric JSON"}
    try: data = json.loads(resp[json_start:json_end])
    except Exception: return {"rubric_text": "", "rubric_json": None, "error": "Could not decode rubric JSON"}
    return {"rubric_text": data.get("rubric_text", ""), "rubric_json": data.get("rubric_json"), "error": None}

async def deep_analyze_stream(pages: List[dict], query: str, doc_name: str, model: str = "gemini-2.5-flash", speed: str = "balanced", rubric_text: Optional[str] = None, relevance_mode: str = "normal"):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        yield {"type": "error", "message": "EMERGENT_LLM_KEY not configured"}
        return
    model_map = {
        "gpt-5.2": ("openai", "gpt-5.2"),
        "gpt-4o": ("openai", "gpt-4o"),
        "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
        "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
        "claude-sonnet-4.5": ("anthropic", "claude-sonnet-4-20250514"),
    }
    provider, model_name = model_map.get(model, ("gemini", "gemini-2.5-flash"))
    speed_settings = {"thorough": 10, "balanced": 20, "fast": 30}
    batch_size = speed_settings.get(speed, 20)
    all_findings = []
    page_analysis_log = []
    total_batches = (len(pages) + batch_size - 1) // batch_size
    for batch_idx, batch_start in enumerate(range(0, len(pages), batch_size)):
        batch_pages = pages[batch_start:batch_start + batch_size]
        batch_num = batch_idx + 1
        start_page = batch_pages[0]['page_number']
        end_page = batch_pages[-1]['page_number']
        yield {"type": "progress", "batch": batch_num, "total_batches": total_batches, "pages": f"{start_page}-{end_page}", "total_pages": len(pages), "percent": round((batch_num / total_batches) * 100), "status": f"Reading pages {start_page}-{end_page} of {len(pages)}...", "model": model, "relevance_mode": relevance_mode}
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"deep-scan-{uuid.uuid4()}",
                system_message=f"""You are a meticulous document analyst. RELEVANCE RUBRIC: {rubric_text or 'Derive from query'}. Return STRICT JSON: {{ "page_results": [{{ "page_number": int, "status": "match"|"possible"|"no_match"|"empty", "findings": [{{ "text": "quote", "relevance": "why", "confidence": "high"|"medium"|"low" }}], "page_summary": "..." }}], "batch_thinking": "..." }}"""
            ).with_model(provider, model_name)
            pages_text = ""
            for p in batch_pages: pages_text += f"\n\n{'='*50}\nPAGE {p['page_number']} ({p['word_count']} words)\n{'='*50}\n{p['text']}"
            user_message = UserMessage(text=f"DOCUMENT: {doc_name}\nSEARCH QUERY: {query}\nRELEVANCE_MODE: {relevance_mode}\nPAGES:\n{pages_text}")
            response = await chat.send_message(user_message)
            try:
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    result = json.loads(response[json_start:json_end])
                    if result.get('batch_thinking'): yield {"type": "thinking", "pages": f"{start_page}-{end_page}", "thought": result.get('batch_thinking')}
                    for page_result in result.get('page_results', []):
                        page_num = page_result.get('page_number')
                        status = page_result.get('status', 'no_match')
                        normalized_status = ('found' if status in ['match', 'possible', 'found'] else 'empty' if status == 'empty' else 'no_match')
                        page_analysis_log.append({"page_number": page_num, "status": normalized_status, "summary": page_result.get('page_summary', ''), "document": doc_name})
                        for finding in page_result.get('findings', []):
                            if finding.get('text'):
                                new_finding = {"page_number": page_num, "document": doc_name, "text": finding.get('text'), "relevance": finding.get('relevance', ''), "confidence": finding.get('confidence', 'medium'), "match_type": 'possible' if status == 'possible' else 'match'}
                                all_findings.append(new_finding)
                                yield {"type": "finding", "finding": new_finding}
            except json.JSONDecodeError:
                 for p in batch_pages: page_analysis_log.append({"page_number": p['page_number'], "status": "analyzed", "summary": "Processed", "document": doc_name})
        except Exception as e:
            yield {"type": "error", "message": str(e), "batch": batch_num}
            continue
    yield {"type": "complete", "findings": all_findings, "page_log": page_analysis_log, "total_pages": len(pages), "pages_analyzed": len(page_analysis_log)}

async def chat_with_docs(pages: List[dict], message: str, history: List[dict]) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key: raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    doc_text = ""
    for p in pages: doc_text += f"\n[PAGE {p['page_number']}]\n{p['text']}\n"
    history_text = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history[-10:]])
    chat = LlmChat(
        api_key=api_key,
        session_id=f"chat-{uuid.uuid4()}",
        system_message=f"You are analyzing these documents:\n{doc_text[:50000]}\nPrevious conversation:\n{history_text}"
    ).with_model("gemini", "gemini-2.5-flash")
    return await chat.send_message(UserMessage(text=message))

async def _pro_system_instruction() -> str:
    return """You are an expert Lead Auditor. OUTPUT STRICT JSON: { "doc_type": "...", "structure": {...}, "findings": [{ "global_page": 1, "section": "...", "quote": "...", "why_relevant": "...", "confidence": "high|medium|low" }], "notes": "..." }"""

# Routes
@api_router.get("/")
async def root():
    return {"message": "Document Deep Scanner API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

@api_router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'): raise HTTPException(status_code=400, detail="Only PDF files supported")
    content = await file.read()
    pages = extract_pdf_pages(content)
    if not pages: raise HTTPException(status_code=400, detail="Could not extract text from PDF")
    doc_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{doc_id}.pdf"
    async with aiofiles.open(file_path, 'wb') as f: await f.write(content)
    total_words = sum(p['word_count'] for p in pages)
    doc = {"id": doc_id, "filename": file.filename, "total_pages": len(pages), "total_words": total_words, "pages": pages, "uploaded_at": datetime.now(timezone.utc).isoformat(), "status": "ready"}
    await db.documents.insert_one(doc)
    return {"id": doc_id, "filename": file.filename, "total_pages": len(pages), "total_words": total_words, "status": "ready"}

@api_router.get("/documents")
async def list_documents():
    return await db.documents.find({}, {"_id": 0, "pages": 0}).to_list(100)

@api_router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Document not found")
    return doc

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    result = await db.documents.delete_one({"id": doc_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Document not found")
    file_path = UPLOAD_DIR / f"{doc_id}.pdf"
    if file_path.exists(): file_path.unlink()
    return {"message": "Deleted"}

@api_router.post("/pro/upload/init")
async def pro_upload_init(req: ProUploadInitRequest):
    upload_id = str(uuid.uuid4())
    tmp_path = PRO_UPLOAD_DIR / f"{upload_id}.pdf"
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    with open(tmp_path, "wb"): pass
    session = {"id": upload_id, "filename": req.filename, "size_bytes": req.size_bytes, "tmp_path": str(tmp_path), "uploaded_bytes": 0, "status": "uploading", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.pro_upload_sessions.insert_one(session)
    return {"upload_id": upload_id}

@api_router.post("/pro/upload/{upload_id}/chunk")
async def pro_upload_chunk(upload_id: str, request: Request):
    session = await db.pro_upload_sessions.find_one({"id": upload_id}, {"_id": 0})
    if not session: raise HTTPException(status_code=404, detail="Upload session not found")
    tmp_path = Path(session["tmp_path"])
    chunk = await request.body()
    if not chunk: raise HTTPException(status_code=400, detail="Empty chunk")
    async with aiofiles.open(tmp_path, 'ab') as f: await f.write(chunk)
    uploaded = session.get("uploaded_bytes", 0) + len(chunk)
    await db.pro_upload_sessions.update_one({"id": upload_id}, {"$set": {"uploaded_bytes": uploaded}})
    return {"upload_id": upload_id, "uploaded_bytes": uploaded}

@api_router.post("/pro/upload/complete")
async def pro_upload_complete(req: ProUploadCompleteRequest):
    session = await db.pro_upload_sessions.find_one({"id": req.upload_id}, {"_id": 0})
    if not session: raise HTTPException(status_code=404, detail="Upload session not found")
    pdf_path = Path(session["tmp_path"])
    if not pdf_path.exists(): raise HTTPException(status_code=400, detail="Uploaded file missing")
    total_pages = _pdf_page_count(pdf_path)
    file_size_mb = pdf_path.stat().st_size / (1024 * 1024)
    needs_split = total_pages > GEMINI_FILE_MAX_PAGES or file_size_mb > GEMINI_FILE_MAX_SIZE_MB
    if needs_split: parts_meta = _split_pdf_by_pages(pdf_path, PRO_UPLOAD_DIR / req.upload_id)
    else: parts_meta = [{"part_index": 1, "start_page": 1, "end_page": total_pages, "local_path": str(pdf_path), "size_bytes": pdf_path.stat().st_size}]
    gemini_parts = []
    for p in parts_meta:
        file_obj = await gemini_files_resumable_upload(req.gemini_api_key, Path(p["local_path"]), f"{session['filename']} (pages {p['start_page']}-{p['end_page']})")
        gemini_parts.append({**p, "gemini_file_name": file_obj.get('name'), "gemini_file_uri": file_obj.get('uri'), "expiration_time": file_obj.get('expirationTime'), "state": (file_obj.get('state') or {}).get('name') if isinstance(file_obj.get('state'), dict) else file_obj.get('state')})
    pro_doc_id = str(uuid.uuid4())
    pro_doc = {"id": pro_doc_id, "filename": session['filename'], "total_pages": total_pages, "size_bytes": session.get('size_bytes'), "parts": gemini_parts, "created_at": datetime.now(timezone.utc).isoformat(), "status": "ready"}
    await db.pro_documents.insert_one(pro_doc)
    await db.pro_upload_sessions.update_one({"id": req.upload_id}, {"$set": {"status": "complete", "pro_document_id": pro_doc_id}})
    return {"pro_document_id": pro_doc_id, "total_pages": total_pages, "parts": [{"start_page": p['start_page'], "end_page": p['end_page'], "file_uri": p['gemini_file_uri']} for p in gemini_parts]}

@api_router.get("/pro/documents")
async def list_pro_documents():
    return await db.pro_documents.find({}, {"_id": 0}).to_list(100)

@api_router.get("/pro/documents/{pro_document_id}")
async def get_pro_document(pro_document_id: str):
    doc = await db.pro_documents.find_one({"id": pro_document_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Pro document not found")
    return doc

@api_router.post("/pro/models")
async def pro_models(payload: Dict[str, Any]):
    gemini_api_key = payload.get('gemini_api_key')
    if not gemini_api_key: raise HTTPException(status_code=400, detail="gemini_api_key is required")
    models = await gemini_models_list(gemini_api_key)
    simplified = [{"name": (m.get('name', '') or '').replace('models/', ''), "supportedGenerationMethods": m.get('supportedGenerationMethods') or []} for m in models]
    pro_generate = [s["name"] for s in simplified if 'pro' in s["name"].lower() and 'flash' not in s["name"].lower() and 'generateContent' in s["supportedGenerationMethods"]]
    return {"pro_generateContent_models": pro_generate, "models": simplified, "all_models_count": len(simplified)}

@api_router.delete("/pro/documents/{pro_document_id}")
async def delete_pro_document(pro_document_id: str, gemini_api_key: str):
    doc = await db.pro_documents.find_one({"id": pro_document_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Pro document not found")
    for p in doc.get('parts', []):
        name = p.get('gemini_file_name')
        if name:
            try: await gemini_files_delete(gemini_api_key, name)
            except Exception: pass
    await db.pro_documents.delete_one({"id": pro_document_id})
    return {"message": "Deleted"}

@api_router.post("/pro/analyze/stream")
async def pro_analyze_stream(req: ProAnalyzeRequest):
    doc = await db.pro_documents.find_one({"id": req.pro_document_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Pro document not found")
    total_pages = doc.get('total_pages', 0)
    parts = doc.get('parts', [])
    estimated_tokens = _estimate_tokens_for_pages(total_pages)
    multi_part_mode = len(parts) > 1
    token_batch_mode = estimated_tokens > PRO_TOKEN_SAFETY_LIMIT
    batch_mode = multi_part_mode or token_batch_mode
    analysis_id = str(uuid.uuid4())
    analysis = {"id": analysis_id, "pro_document_id": req.pro_document_id, "document_name": doc.get('filename'), "query": req.query, "mode": "pro_native_pdf", "model_preferred": "gemini-1.5-pro", "model_used": None, "batch_mode": batch_mode, "estimated_tokens": estimated_tokens, "status": "in_progress", "findings": [], "structure": None, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.pro_analyses.insert_one(analysis)

    async def generate():
        try:
            yield f"data: {json.dumps({'type':'start','analysis_id':analysis_id,'total_pages':total_pages,'batch_mode':batch_mode,'estimated_tokens':estimated_tokens,'parts': [{'start':p['start_page'],'end':p['end_page']} for p in parts]})}\n\n"
            system_instruction = await _pro_system_instruction()
            if not batch_mode:
                global_page_note = "\n".join([f"- Part {p['part_index']}: this file starts at Global Page {p['start_page']} (ends at {p['end_page']})." for p in parts])
                user_text = f"USER QUERY:\n{req.query}\n\nGLOBAL PAGE OFFSETS:\n{global_page_note}\n\nNow perform the process and return JSON."
                resp = await gemini_generate_content_with_files(api_key=req.gemini_api_key, model_preferred="gemini-1.5-pro", system_instruction=system_instruction, user_text=user_text, file_uris=_build_file_uri_parts(parts))
                model_used = resp.get('__model_used__')
                parsed = _safe_parse_json(_extract_candidate_json_text(resp))
                await db.pro_analyses.update_one({"id": analysis_id}, {"$set": {"model_used": model_used, "status": "complete", "result": parsed}})
                yield f"data: {json.dumps({'type':'done','analysis_id':analysis_id,'model_used':model_used,'result':parsed})}\n\n"
                return

            batch_results = []
            if multi_part_mode:
                for idx, p in enumerate(parts, 1):
                    b_start, b_end = p['start_page'], p['end_page']
                    yield f"data: {json.dumps({'type':'batch_start','batch': idx,'total_batches': len(parts),'pages': {'start': b_start, 'end': b_end}})}\n\n"
                    user_text = f"PART {idx} of {len(parts)}.\nUSER QUERY:\n{req.query}\n\nGLOBAL PAGE NOTE:\nThis file contains pages {b_start} to {b_end}.\n\nReturn JSON findings for this part only."
                    resp = await gemini_generate_content_with_files(api_key=req.gemini_api_key, model_preferred="gemini-1.5-pro", system_instruction=system_instruction, user_text=user_text, file_uris=[{"mime_type": "application/pdf", "file_uri": p['gemini_file_uri']}])
                    batch_results.append(_safe_parse_json(_extract_candidate_json_text(resp)))
                    yield f"data: {json.dumps({'type':'batch_done','batch': idx})}\n\n"
            else:
                 # Token batch mode logic (omitted for brevity, can be added if needed, but strict 1 file limit usually avoids this)
                 pass

            merge_prompt = {"batches": batch_results, "instruction": "Combine into one cohesive report."}
            resp_merge = await gemini_generate_content_with_files(api_key=req.gemini_api_key, model_preferred="gemini-1.5-pro", system_instruction=system_instruction, user_text=json.dumps(merge_prompt), file_uris=[])
            merged = _safe_parse_json(_extract_candidate_json_text(resp_merge))
            await db.pro_analyses.update_one({"id": analysis_id}, {"$set": {"status": "complete", "result": merged}})
            yield f"data: {json.dumps({'type':'done','analysis_id':analysis_id,'result':merged})}\n\n"
        except Exception as e:
            await db.pro_analyses.update_one({"id": analysis_id}, {"$set": {"status": "failed", "error": str(e)}})
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@api_router.get("/pro/analyses")
async def list_pro_analyses():
    return await db.pro_analyses.find({}, {"_id": 0}).to_list(100)

@api_router.get("/pro/analyses/{analysis_id}")
async def get_pro_analysis(analysis_id: str):
    a = await db.pro_analyses.find_one({"id": analysis_id}, {"_id": 0})
    if not a: raise HTTPException(status_code=404, detail="Pro analysis not found")
    return a

@api_router.post("/pro/chat")
async def pro_chat(req: ProChatRequest):
    doc = await db.pro_documents.find_one({"id": req.pro_document_id}, {"_id": 0})
    if not doc: raise HTTPException(status_code=404, detail="Pro document not found")
    session = None
    if req.session_id: session = await db.pro_chat_sessions.find_one({"id": req.session_id}, {"_id": 0})
    if not session:
        session = {"id": str(uuid.uuid4()), "pro_document_id": req.pro_document_id, "history": [], "created_at": datetime.now(timezone.utc).isoformat()}
        await db.pro_chat_sessions.insert_one(session)
    parts = doc.get('parts', [])
    global_note = "\n".join([f"- Part {p['part_index']}: this file starts at Global Page {p['start_page']} (ends at {p['end_page']})." for p in parts])
    system_instruction = await _pro_system_instruction()
    user_text = f"FOLLOW-UP QUESTION:\n{req.message}\n\nGLOBAL PAGE OFFSETS:\n{global_note}\n\nAnswer with quotes + global page citations in JSON."
    resp = await gemini_generate_content_with_files(api_key=req.gemini_api_key, model_preferred="gemini-1.5-pro", system_instruction=system_instruction, user_text=user_text, file_uris=_build_file_uri_parts(parts))
    parsed = _safe_parse_json(_extract_candidate_json_text(resp))
    await db.pro_chat_sessions.update_one({"id": session['id']}, {"$push": {"history": {"role": "user", "content": req.message, "at": datetime.now(timezone.utc).isoformat()}}})
    await db.pro_chat_sessions.update_one({"id": session['id']}, {"$push": {"history": {"role": "assistant", "content": parsed, "at": datetime.now(timezone.utc).isoformat()}}})
    return {"session_id": session['id'], "answer": parsed}

@api_router.post("/analyze/stream")
async def analyze_documents_stream(request: AnalyzeRequest):
    if not request.document_ids: raise HTTPException(status_code=400, detail="No documents selected")
    if not request.query.strip(): raise HTTPException(status_code=400, detail="Query is required")
    effective_rubric_text = request.rubric_text
    if not effective_rubric_text or not effective_rubric_text.strip():
        rubric = await generate_query_rubric(request.query, request.model)
        if rubric.get('error'): raise HTTPException(status_code=500, detail=rubric['error'])
        effective_rubric_text = rubric.get('rubric_text', '')
    analysis_id = str(uuid.uuid4())
    doc_names = []
    total_pages = 0
    docs_to_process = []
    for doc_id in request.document_ids:
        doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
        if doc:
            pages = doc.get('pages', [])
            if request.page_start or request.page_end:
                start = (request.page_start or 1) - 1
                end = request.page_end or len(pages)
                pages = [p for p in pages if start < p['page_number'] <= end]
                doc = {**doc, 'pages': pages, 'total_pages': len(pages)}
            docs_to_process.append(doc)
            doc_names.append(doc['filename'])
            total_pages += len(pages)
    analysis = {"id": analysis_id, "document_ids": request.document_ids, "document_names": doc_names, "query": request.query, "model": request.model, "speed": request.speed, "relevance_mode": request.relevance_mode, "rubric_text": effective_rubric_text, "findings": [], "page_coverage": {"total_pages": total_pages, "pages_analyzed": 0, "pages_with_findings": 0, "coverage_percent": 0}, "page_log": [], "status": "in_progress", "analyzed_at": datetime.now(timezone.utc).isoformat()}
    await db.analyses.insert_one(analysis)
    
    async def generate():
        yield f"data: {json.dumps({'type': 'start', 'analysis_id': analysis_id, 'total_pages': total_pages, 'documents': doc_names, 'rubric_text': effective_rubric_text, 'relevance_mode': request.relevance_mode})}\n\n"
        for doc in docs_to_process:
            yield f"data: {json.dumps({'type': 'document_start', 'document': doc['filename'], 'pages': doc['total_pages']})}\n\n"
            doc_page_logs = []
            async for update in deep_analyze_stream(doc.get('pages', []), request.query, doc['filename'], request.model, request.speed, effective_rubric_text, request.relevance_mode):
                if update['type'] == 'finding':
                    await db.analyses.update_one({"id": analysis_id}, {"$push": {"findings": update['finding']}})
                    if update['finding'].get('match_type') == 'match': await db.analyses.update_one({"id": analysis_id}, {"$inc": {"page_coverage.pages_with_findings": 1}})
                elif update['type'] == 'complete':
                    page_log = update.get('page_log', [])
                    doc_page_logs.extend(page_log)
                    await db.analyses.update_one({"id": analysis_id}, {"$push": {"page_log": {"$each": page_log}}, "$inc": {"page_coverage.pages_analyzed": len(page_log)}})
                elif update['type'] == 'progress': await db.analyses.update_one({"id": analysis_id}, {"$set": {"status": "in_progress"}})
                try: yield f"data: {json.dumps(update)}\n\n"
                except Exception: pass
        final_analysis = await db.analyses.find_one({"id": analysis_id}, {"_id": 0})
        pages_with_findings = len(set(f['page_number'] for f in final_analysis.get('findings', []) if f.get('match_type') != 'possible'))
        pages_analyzed = final_analysis.get('page_coverage', {}).get('pages_analyzed', 0)
        await db.analyses.update_one({"id": analysis_id}, {"$set": {"status": "complete", "page_coverage.pages_with_findings": pages_with_findings, "page_coverage.coverage_percent": round((pages_analyzed / total_pages * 100) if total_pages > 0 else 0, 1)}})
        yield f"data: {json.dumps({'type': 'done', 'analysis_id': analysis_id, 'total_findings': len(final_analysis.get('findings', [])), 'coverage': final_analysis.get('page_coverage', {})})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

@api_router.post("/rubric", response_model=RubricResponse)
async def build_rubric(request: RubricRequest):
    if not request.query.strip(): raise HTTPException(status_code=400, detail="Query is required")
    rubric = await generate_query_rubric(request.query, request.model)
    if rubric.get('error'): raise HTTPException(status_code=500, detail=rubric['error'])
    return RubricResponse(rubric_text=rubric.get('rubric_text', ''), rubric_json=rubric.get('rubric_json'))

@api_router.get("/analyses")
async def list_analyses():
    return await db.analyses.find({}, {"_id": 0, "page_log": 0}).to_list(100)

@api_router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    analysis = await db.analyses.find_one({"id": analysis_id}, {"_id": 0})
    if not analysis: raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis

@api_router.post("/chat")
async def chat(request: ChatRequest):
    if request.session_id: session = await db.chat_sessions.find_one({"id": request.session_id}, {"_id": 0})
    else:
        session = {"id": str(uuid.uuid4()), "document_ids": request.document_ids, "messages": [], "created_at": datetime.now(timezone.utc).isoformat()}
        await db.chat_sessions.insert_one(session)
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    all_pages = []
    for doc_id in request.document_ids:
        doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
        if doc:
            for p in doc.get('pages', []): all_pages.append({**p, "document": doc['filename']})
    user_msg = {"role": "user", "content": request.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    response = await chat_with_docs(all_pages, request.message, session.get('messages', []))
    assistant_msg = {"role": "assistant", "content": response, "timestamp": datetime.now(timezone.utc).isoformat()}
    await db.chat_sessions.update_one({"id": session["id"]}, {"$push": {"messages": {"$each": [user_msg, assistant_msg]}}})
    return {"session_id": session["id"], "response": response}

@api_router.get("/chat/{session_id}")
async def get_chat(session_id: str):
    session = await db.chat_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    return session

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
