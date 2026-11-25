import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Guild = {
  id: string;
  name: string;
  role: string;
  verification_status?: string;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
};

type AuthState = {
  token: string;
  username: string;
  isAdmin: boolean;
  guilds: Guild[];
  guildId: string;
  setSession: (token: string, username: string, isAdmin?: boolean) => void;
  setGuilds: (guilds: Guild[]) => void;
  setGuildId: (id: string) => void;
  setIsAdmin: (v: boolean) => void;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);
const LS_TOKEN = "wga_token";
const LS_USER = "wga_user";
const LS_GUILD = "wga_guild";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) || "");
  const [username, setUsername] = useState(
    () => localStorage.getItem(LS_USER) || ""
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [guilds, setGuildsState] = useState<Guild[]>([]);
  const [guildId, setGuildIdState] = useState(
    () => localStorage.getItem(LS_GUILD) || ""
  );

  const value = useMemo<AuthState>(
    () => ({
      token,
      username,
      isAdmin,
      guilds,
      guildId,
      setSession: (t, u, admin) => {
        setToken(t);
        setUsername(u);
        setIsAdmin(!!admin);
        localStorage.setItem(LS_TOKEN, t);
        localStorage.setItem(LS_USER, u);
      },
      setGuilds: setGuildsState,
      setIsAdmin,
      setGuildId: (id) => {
        setGuildIdState(id);
        localStorage.setItem(LS_GUILD, id);
      },
      logout: () => {
        setToken("");
        setUsername("");
        setIsAdmin(false);
        setGuildsState([]);
        setGuildIdState("");
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_USER);
        localStorage.removeItem(LS_GUILD);
      },
    }),
    [token, username, isAdmin, guilds, guildId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
