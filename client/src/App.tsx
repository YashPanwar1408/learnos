import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import AnalyticsPage from '@/pages/Analytics'
import CoursesPage from '@/pages/Courses.tsx'
import CourseDetailPage from '@/pages/CourseDetail'
import DashboardPage from '@/pages/Dashboard'
import DocumentsPage from '@/pages/Documents'
import KnowledgeGraphPage from '@/pages/KnowledgeGraph'
import PracticeLabPage from './pages/PracticeLab'
import DocumentWorkspacePage from './pages/DocumentWorkspace'
import ProfilePage from '@/pages/Profile'
import PricingPage from '@/pages/Pricing'
import ChatPage from '@/pages/Chat'
import LearnerTwinPage from '@/pages/LearnerTwin'
import MissionPage from '@/pages/Mission'
import ReviewCenterPage from '@/pages/ReviewCenter'
import TutorPage from '@/pages/Tutor'
import TeacherPage from '@/pages/Teacher'
import QuizPage from '@/pages/Quiz'
import FlashcardsPage from '@/pages/Flashcards'
import LandingPage from '@/pages/Landing'
import { RequireAuth } from '@/routes/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="missions" element={<MissionPage />} />
          <Route path="learner-twin" element={<LearnerTwinPage />} />
          <Route path="review" element={<ReviewCenterPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="knowledge-graph" element={<KnowledgeGraphPage />} />
          <Route path="practice-lab" element={<PracticeLabPage />} />
          <Route path="documents/:id" element={<DocumentWorkspacePage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="tutor" element={<TutorPage />} />
          <Route path="teacher" element={<TeacherPage />} />
          <Route path="quiz" element={<QuizPage />} />
          <Route path="flashcards" element={<FlashcardsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
