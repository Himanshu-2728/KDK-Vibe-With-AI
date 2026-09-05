import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";
import type { User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  booting: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .get<{ user: User }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  const login = (token: string, nextUser: User) => {
    setToken(token);
    setUser(nextUser);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const refresh = async () => {
    try {
      const res = await api.get<{ user: User }>("/api/auth/me");
      setUser(res.user);
    } catch {
      /* stays logged out */
    }
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}