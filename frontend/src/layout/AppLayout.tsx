import DashboardIcon from "@mui/icons-material/Dashboard";
import DomainIcon from "@mui/icons-material/Domain";
import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SchemaIcon from "@mui/icons-material/Schema";
import SensorsIcon from "@mui/icons-material/Sensors";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { ackAllNotifications, ackNotification, fetchNotifications } from "../services/alertsApi";
import { canManageSources, canManageStates, canManageTags } from "../services/roleUtils";
import { NotificationEvent } from "../types/alerts";

const drawerWidth = 240;

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupNotification, setPopupNotification] = useState<NotificationEvent | null>(null);

  const seenPopupIdsRef = useRef<Set<number>>(new Set());

  const items = useMemo(() => {
    const baseItems = [
      { label: "Home", icon: <DashboardIcon />, to: "/" },
      { label: "Alert", icon: <DomainIcon />, to: "/tenant" },
    ];

    if (canManageSources(user?.role)) {
      baseItems.push({ label: "Fonti", icon: <SensorsIcon />, to: "/fonti" });
      baseItems.push({ label: "Parser", icon: <SchemaIcon />, to: "/parser" });
    }

    if (canManageStates(user?.role) || canManageTags(user?.role)) {
      baseItems.push({ label: "Admin", icon: <SettingsIcon />, to: "/configurazione" });
    }

    return baseItems;
  }, [user?.role]);

  const loadNotifications = async () => {
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
      // best effort; non bloccare UI
    }
  };

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

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

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            SocView
          </Typography>

          <IconButton color="inherit" onClick={() => setNotificationDrawerOpen(true)} aria-label="notifications">
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          <Typography variant="body2" sx={{ mr: 2, ml: 1 }}>
            {user?.username} ({user?.role})
          </Typography>
          <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            mt: "64px",
          },
        }}
      >
        <List>
          {items.map((item) => (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Drawer
        anchor="right"
        open={notificationDrawerOpen}
        onClose={() => setNotificationDrawerOpen(false)}
        sx={{ [`& .MuiDrawer-paper`]: { width: 380, p: 2 } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">Notification Center</Typography>
          <Button size="small" onClick={() => void handleAckAll()}>
            Segna tutto letto
          </Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        <List>
          {notifications.map((item) => (
            <ListItemButton
              key={item.id}
              sx={{
                mb: 1,
                borderRadius: 1,
                border: "1px solid #e0e0e0",
                alignItems: "flex-start",
                opacity: item.is_read ? 0.65 : 1,
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
                    <Typography variant="body2">{item.title}</Typography>
                    {!item.is_read ? (
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "error.main" }} />
                    ) : null}
                  </Stack>
                }
                secondary={
                  <>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.created_at).toLocaleString("it-IT")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
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

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: "64px", ml: `${drawerWidth}px` }}>
        <Outlet />
      </Box>
    </Box>
  );
}
