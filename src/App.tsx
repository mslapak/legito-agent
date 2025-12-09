import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DashboardLayout from "./components/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import NewTask from "./pages/dashboard/NewTask";
import TaskHistory from "./pages/dashboard/TaskHistory";
import TaskDetail from "./pages/dashboard/TaskDetail";
import TestGenerator from "./pages/dashboard/TestGenerator";
import Projects from "./pages/dashboard/Projects";
import DocumentationVerify from "./pages/dashboard/DocumentationVerify";
import NewOperation from "./pages/dashboard/NewOperation";
import OperationHistory from "./pages/dashboard/OperationHistory";
import OperationDetail from "./pages/dashboard/OperationDetail";
import OperationTemplates from "./pages/dashboard/OperationTemplates";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardHome />} />
              <Route path="new-task" element={<NewTask />} />
              <Route path="history" element={<TaskHistory />} />
              <Route path="task/:taskId" element={<TaskDetail />} />
              <Route path="test-generator" element={<TestGenerator />} />
              <Route path="doc-verify" element={<DocumentationVerify />} />
              <Route path="projects" element={<Projects />} />
              <Route path="operations/new" element={<NewOperation />} />
              <Route path="operations/history" element={<OperationHistory />} />
              <Route path="operations/:operationId" element={<OperationDetail />} />
              <Route path="operations/templates" element={<OperationTemplates />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
