import DashboardIcon from "@mui/icons-material/Dashboard";
import DescriptionIcon from "@mui/icons-material/Description";
import DomainIcon from "@mui/icons-material/Domain";
import GroupsIcon from "@mui/icons-material/Groups";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import SensorsIcon from "@mui/icons-material/Sensors";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { ackAllNotifications, ackNotification, fetchNotifications } from "../services/alertsApi";
import { NotificationEvent } from "../types/alerts";

const sidebarWidth = 220;
type MenuItem = {
  label: string;
  icon: ReactElement;
  to: string;
  requiresTenant?: boolean;
};

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupNotification, setPopupNotification] = useState<NotificationEvent | null>(null);
  const [currentSchema, setCurrentSchema] = useState<string>("public");

  const seenPopupIdsRef = useRef<Set<number>>(new Set());
  const isTenantContext = currentSchema !== "public";

  const items = useMemo<MenuItem[]>(
    () => [
      { label: "Dashboard", icon: <DashboardIcon />, to: "/" },
      { label: "Active Alarms", icon: <DomainIcon />, to: "/active-alarms" },
      { label: "Costumers", icon: <GroupsIcon />, to: "/costumers" },
      { label: "Sources", icon: <SensorsIcon />, to: "/fonti", requiresTenant: true },
      { label: "Reports", icon: <DescriptionIcon />, to: "/reports" },
      { label: "Management", icon: <SettingsIcon />, to: "/configurazione", requiresTenant: true },
    ],
    [],
  );

  useEffect(() => {
    const loadContext = async () => {
      try {
        const response = await api.get<{ tenant: string }>("/core/context/");
        setCurrentSchema(response.data.tenant || "public");
      } catch {
        setCurrentSchema("public");
      }
    };
    void loadContext();
  }, [user?.id]);

  const loadNotifications = async () => {
    if (!isTenantContext) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const response = await fetchNotifications("all", 30);
      setNotifications(response.results);
      setUnreadCount(response.unread_count);

      const criticalUnread = response.results.find(
        (item) => !item.is_read && item.severity === "critical",
      );

      if (criticalUnread && !seenPopupIdsRef.current.has(criticalUnread.id)) {
        seenPopupIdsRef.current.add(criticalUnread.id);
        setPopupNotification(criticalUnread);
      }
    } catch {
      // non bloccare la UI
    }
  };

  useEffect(() => {
    if (!isTenantContext) {
      setNotificationDrawerOpen(false);
      setPopupNotification(null);
      void loadNotifications();
      return;
    }

    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [isTenantContext]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleAckNotification = async (notificationId: number) => {
    try {
      await ackNotification(notificationId);
      await loadNotifications();
    } catch {
      // best effort
    }
  };

  const handleAckAll = async () => {
    try {
      await ackAllNotifications();
      await loadNotifications();
    } catch {
      // best effort
    }
  };

  const drawerContent = (
    <Stack sx={{ height: "100%", bgcolor: "#08142d", color: "#c7d2fe" }}>
      <Box sx={{ px: 2, py: 2.5 }}>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(180deg,#3b82f6,#1d4ed8)",
            }}
          >
            <ShieldOutlinedIcon fontSize="small" sx={{ color: "#e0ecff" }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, color: "#f8fafc", lineHeight: 1.2 }}>SocView</Typography>
            <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>Security Command</Typography>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ px: 2, pb: 2 }}>
        <Box
          sx={{
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 2,
            p: 1.2,
            background: "rgba(15, 23, 42, 0.7)",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
            {isTenantContext ? currentSchema.toUpperCase() : "PUBLIC"}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#64748b" }}>
            {isTenantContext ? "Tenant operativo" : "Vista multi-tenant"}
          </Typography>
        </Box>
      </Box>

        <List sx={{ px: 1 }}>
          {items.map((item) => {
            const selected = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            const disabled = Boolean(item.requiresTenant && !isTenantContext);
            return (
              <ListItemButton
                key={item.to}
                component={Link}
                to={item.to}
                onClick={() => setMobileDrawerOpen(false)}
                selected={selected}
                disabled={disabled}
                sx={{
                  mb: 0.4,
                  borderRadius: 2,
                  color: selected ? "#dbeafe" : "#94a3b8",
                  border: selected ? "1px solid rgba(59,130,246,0.55)" : "1px solid transparent",
                  background: selected ? "linear-gradient(90deg,rgba(37,99,235,0.24),rgba(30,58,138,0.1))" : "transparent",
                  opacity: disabled ? 0.45 : 1,
                }}
              >
              <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: selected ? 600 : 500,
                }}
              />
              {item.to === "/tenant" && unreadCount > 0 ? (
                <Chip size="small" label={unreadCount} color="error" sx={{ height: 18 }} />
              ) : null}
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <Box sx={{ p: 2, borderTop: "1px solid rgba(148,163,184,0.15)" }}>
        <Typography sx={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{user?.username}</Typography>
        <Typography sx={{ fontSize: 11, color: "#64748b" }}>{user?.role}</Typography>
      </Box>
    </Stack>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(37,99,235,0.18), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.08), transparent 35%), #020817",
        color: "#e2e8f0",
      }}
    >
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
          background: "rgba(2,6,23,0.82)",
          borderBottom: "1px solid rgba(71,85,105,0.35)",
          backdropFilter: "blur(10px)",
          ml: { md: `${sidebarWidth}px` },
          width: { md: `calc(100% - ${sidebarWidth}px)` },
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          ) : null}

          <TextField
            size="small"
            placeholder="Search IP, Hash, Event ID..."
            sx={{
              minWidth: { xs: 150, md: 360 },
              flexGrow: 1,
              maxWidth: 560,
              "& .MuiOutlinedInput-root": {
                bgcolor: "rgba(15,23,42,0.86)",
                color: "#cbd5e1",
                borderRadius: 2,
                "& fieldset": { borderColor: "rgba(71,85,105,0.5)" },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "#64748b", fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />

          <IconButton
            color="inherit"
            onClick={() => setNotificationDrawerOpen(true)}
            aria-label="notifications"
            disabled={!isTenantContext}
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          <Chip
            label="System Healthy"
            size="small"
            sx={{
              height: 24,
              color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.35)",
              background: "rgba(22,101,52,0.15)",
            }}
          />

          <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileDrawerOpen : true}
        onClose={() => setMobileDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: sidebarWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: sidebarWidth,
            boxSizing: "border-box",
            borderRight: "1px solid rgba(71,85,105,0.28)",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Drawer
        anchor="right"
        open={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
        sx={{
          [`& .MuiDrawer-paper`]: {
            width: 380,
            p: 2,
            background: "#060f24",
            color: "#dbeafe",
            borderLeft: "1px solid rgba(71,85,105,0.3)",
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Notification Center</Typography>
          <Button size="small" onClick={() => void handleAckAll()} sx={{ color: "#93c5fd" }}>
            Segna tutto letto
          </Button>
        </Stack>
        <Divider sx={{ mb: 1, borderColor: "rgba(71,85,105,0.35)" }} />
        <List>
          {notifications.map((item) => (
            <ListItemButton
              key={item.id}
              sx={{
                mb: 1,
                borderRadius: 1,
                border: "1px solid rgba(71,85,105,0.45)",
                alignItems: "flex-start",
                opacity: item.is_read ? 0.65 : 1,
                bgcolor: "rgba(15,23,42,0.65)",
              }}
              onClick={() => {
                void handleAckNotification(item.id);
                navigate(`/alerts/${item.alert}`);
                setNotificationDrawerOpen(false);
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ color: "#e2e8f0" }}>{item.title}</Typography>
                    {!item.is_read ? (
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "error.main" }} />
                    ) : null}
                  </Stack>
                }
                secondary={
                  <>
                    <Typography variant="caption" sx={{ color: "#64748b" }}>
                      {new Date(item.created_at).toLocaleString("it-IT")}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                      {item.message}
                    </Typography>
                  </>
                }
              />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Snackbar
        open={Boolean(popupNotification)}
        autoHideDuration={8000}
        onClose={() => setPopupNotification(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setPopupNotification(null)}
          sx={{ width: "100%", cursor: "pointer" }}
          onClick={() => {
            if (popupNotification) {
              navigate(`/alerts/${popupNotification.alert}`);
              setPopupNotification(null);
            }
          }}
        >
          {popupNotification?.title}
        </Alert>
      </Snackbar>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          pt: { xs: 10, md: 12 },
          minHeight: "100vh",
        }}
      >
        {!isTenantContext ? (
          <Alert
            severity="info"
            sx={{
              mb: 2,
              background: "rgba(30,64,175,0.14)",
              color: "#bfdbfe",
              border: "1px solid rgba(96,165,250,0.3)",
            }}
          >
            Sei nel dominio public. Dalla dashboard puoi aprire tenant1.localhost, tenant2.localhost e tenant3.localhost.
          </Alert>
        ) : null}

        <Outlet />
      </Box>
    </Box>
  );
}
