import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import GuildPage from "./pages/GuildPage";
import CharactersPage from "./pages/CharactersPage";
import CharacterDetailPage from "./pages/CharacterDetailPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ActivityDetailPage from "./pages/ActivityDetailPage";

function Shell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <div className="layout">
      <header className="top">
        <div>
          <Link to="/" className="brand">
            WGA
          </Link>
          <span className="muted">公会助手</span>
        </div>
        <nav>
          <Link to="/characters">角色</Link>
          <Link to="/activities">活动</Link>
          <Link to="/guild">公会</Link>
        </nav>
        <div className="user">
          <span>{auth.username}</span>
          <button type="button" className="linkish" onClick={auth.logout}>
            退出
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth.token) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Private>
            <Navigate to="/characters" replace />
          </Private>
        }
      />
      <Route
        path="/guild"
        element={
          <Private>
            <GuildPage />
          </Private>
        }
      />
      <Route
        path="/characters"
        element={
          <Private>
            <CharactersPage />
          </Private>
        }
      />
      <Route
        path="/characters/:charId"
        element={
          <Private>
            <CharacterDetailPage />
          </Private>
        }
      />
      <Route
        path="/activities"
        element={
          <Private>
            <ActivitiesPage />
          </Private>
        }
      />
      <Route
        path="/activities/:activityId"
        element={
          <Private>
            <ActivityDetailPage />
          </Private>
        }
      />
    </Routes>
  );
}
