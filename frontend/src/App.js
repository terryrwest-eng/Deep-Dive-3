import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import DeepDive from "@/pages/DeepDive";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const helloWorldApi = async () => {
    try {
      const response = await axios.get(`${API}/`);
      console.log(response.data.message);
    } catch (e) {
      console.error(e, `errored out requesting / api`);
    }
  };

  useEffect(() => {
    helloWorldApi();
  }, []);

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#121214] border border-[#27272a] rounded-lg p-6">
            <h2 className="text-xl font-medium mb-2 text-[#fafafa]">Welcome back</h2>
            <p className="text-[#a1a1aa]">Select a tool from the sidebar to get started.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App dark">
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/deep-dive" element={<DeepDive />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </div>
  );
}

export default App;
