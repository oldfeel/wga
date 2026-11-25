import { useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import GuildPage from "./pages/GuildPage";
import AdminGuildPage from "./pages/AdminGuildPage";
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
            <img className="brand-logo" src="/wga-logo.png" alt="" width="28" height="28" />
            WGA
          </Link>
          <span className="muted">公会助手</span>
        </div>
        <nav>
          <Link to="/characters">角色</Link>
          <Link to="/activities">活动</Link>
          <Link to="/guild">公会</Link>
          {auth.isAdmin ? <Link to="/admin/guilds">管理</Link> : null}
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
  useEffect(() => {
    if (!auth.token) return;
    api
      .me(auth.token)
      .then((me) => {
        auth.setGuilds(me.guilds || []);
        auth.setIsAdmin(!!me.user?.is_admin);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);
  if (!auth.token) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
        path="/admin/guilds"
        element={
          <Private>
            <AdminGuildPage />
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
