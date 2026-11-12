import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AcceptInvitePage } from '@/features/auth/AcceptInvitePage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaChallengePage } from '@/features/auth/MfaChallengePage';
import { MfaSetupPage } from '@/features/auth/MfaSetupPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { ClassificationPage } from '@/features/classification/ClassificationPage';
import { ClassificationResultPage } from '@/features/classification/ClassificationResultPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DesignSystemPage } from '@/features/design/DesignSystemPage';
import { DocumentEditorPage } from '@/features/documents/DocumentEditorPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { NetworkPage } from '@/features/network/NetworkPage';
import { OrganizationsPage } from '@/features/organizations/OrganizationsPage';
import { SessionsPage } from '@/features/sessions/SessionsPage';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="design" element={<DesignSystemPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="accept-invite" element={<AcceptInvitePage />} />
          <Route path="mfa" element={<MfaChallengePage />} />
          <Route path="mfa-setup" element={<MfaSetupPage />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="classification"
            element={
              <ProtectedRoute>
                <ClassificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="classification/runs/:runId"
            element={
              <ProtectedRoute>
                <ClassificationResultPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="documents"
            element={
              <ProtectedRoute>
                <DocumentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="documents/:documentId"
            element={
              <ProtectedRoute>
                <DocumentEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="network"
            element={
              <ProtectedRoute>
                <NetworkPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="organizations"
            element={
              <ProtectedRoute>
                <OrganizationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="sessions"
            element={
              <ProtectedRoute>
                <SessionsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
