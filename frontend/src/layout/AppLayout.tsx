import DashboardIcon from "@mui/icons-material/Dashboard";
import DescriptionIcon from "@mui/icons-material/Description";
import DomainIcon from "@mui/icons-material/Domain";
import GroupsIcon from "@mui/icons-material/Groups";
import InsertChartOutlinedIcon from "@mui/icons-material/InsertChartOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StorageIcon from "@mui/icons-material/Storage";
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import NotificationDrawer from "../components/NotificationDrawer";
import ThemeToggle from "../components/ThemeToggle";
import StatusBar from "../components/StatusBar";
import { useAuth } from "../context/AuthContext";
import { useCustomer } from "../context/CustomerContext";
import useNotificationsWS from "../hooks/useNotificationsWS";
import { canAccessAdmin, canAccessAnalytics } from "../services/roleUtils";
import { ackAllNotifications, ackNotification, fetchNotifications, snoozeNotification } from "../services/alertsApi";
import { NotificationEvent } from "../types/alerts";

const sidebarWidth = 250;

type MenuItemLink = {
  label: string;
  icon: ReactElement;
  to: string;
  disabled?: boolean;
};

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { customers, selectedCustomer, selectedCustomerId, setSelectedCustomerId } = useCustomer();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupNotification, setPopupNotification] = useState<NotificationEvent | null>(null);
  const [quickSearch, setQuickSearch] = useState("");

  const seenPopupIdsRef = useRef<Set<number>>(new Set());

  const items = useMemo<MenuItemLink[]>(() => {
    const analyticsEnabled = canAccessAnalytics(user?.role, user?.permissions);
    const adminEnabled = canAccessAdmin(user?.role, user?.permissions);
    const menu: MenuItemLink[] = [
      { label: "Dashboard", icon: <DashboardIcon />, to: "/" },
      { label: "Active Alarms", icon: <DomainIcon />, to: "/active-alarms" },
      { label: "Sources", icon: <StorageIcon />, to: "/sources" },
      { label: "Customers", icon: <GroupsIcon />, to: "/customers" },
      { label: "Analytics", icon: <InsertChartOutlinedIcon />, to: "/analytics", disabled: !analyticsEnabled },
      { label: "Management", icon: <SettingsIcon />, to: "/configurazione" },
    ];
    if (adminEnabled) {
      menu.push({ label: "Admin Panel", icon: <DescriptionIcon />, to: "/admin-panel" });
    }
    return menu;
  }, [user?.permissions, user?.role]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetchNotifications("all", 30);
      setNotifications(response.results);
      setUnreadCount(response.unread_count);

      const criticalUnread = response.results.find((item) => !item.is_read && item.severity === "critical");
      if (criticalUnread && !seenPopupIdsRef.current.has(criticalUnread.id)) {
        seenPopupIdsRef.current.add(criticalUnread.id);
        setPopupNotification(criticalUnread);
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    void loadNotifications();
  }, [user, loadNotifications]);

  useNotificationsWS({
    enabled: Boolean(user),
    onNotification: () => {
      void loadNotifications();
    },
    onFallbackPoll: async () => {
      await loadNotifications();
    },
  });

  const handleLogout = async () => {
    await logout();
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

  const handleSnoozeNotification = async (notificationId: number, payload: { minutes?: number; snooze_until?: string }) => {
    try {
      await snoozeNotification(notificationId, payload);
      await loadNotifications();
    } catch {
      // best effort
    }
  };

  const handleQuickSearchSubmit = useCallback(() => {
    const query = quickSearch.trim();
    const nextParams = new URLSearchParams();
    if (query) {
      const encodedFilter = encodeURIComponent(JSON.stringify({ searchText: query, page: 0 }));
      nextParams.set("filter", encodedFilter);
    }
    navigate(
      {
        pathname: "/active-alarms",
        search: nextParams.toString() ? `?${nextParams.toString()}` : "",
      },
      { replace: false },
    );
  }, [navigate, quickSearch]);

  const drawerContent = (
    <Stack sx={{ height: "100%", color: "text.primary" }}>
      <Box sx={{ px: 2.4, py: 2.6 }}>
        <Stack direction="row" spacing={1.4} alignItems="center">
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2.2,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(160deg, rgba(59,130,246,0.85), rgba(34,197,94,0.72))",
              boxShadow: "0 10px 24px rgba(37,99,235,0.35)",
            }}
          >
            <ShieldOutlinedIcon fontSize="small" sx={{ color: theme.palette.primary.contrastText }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>SocView</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>SOC Operations Platform</Typography>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ px: 2.4, pb: 2.2 }}>
        <Box
          sx={{
            borderRadius: 2,
            p: 1.3,
            border: `1px solid ${alpha(theme.palette.info.light, 0.35)}`,
            background: alpha(theme.palette.info.main, 0.08),
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>Contesto cliente</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.code})` : "Tutti i clienti"}
          </Typography>
        </Box>
      </Box>

      <List sx={{ px: 1.4 }}>
        {items.map((item) => {
          const selected = !item.disabled && (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
          return (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              disabled={item.disabled}
              onClick={() => setMobileDrawerOpen(false)}
              selected={selected}
              sx={{
                mb: 0.6,
                borderRadius: 2,
                color: item.disabled ? "text.disabled" : selected ? theme.palette.primary.light : "text.secondary",
                border: `1px solid ${selected ? alpha(theme.palette.primary.main, 0.4) : "transparent"}`,
                background: selected
                  ? "linear-gradient(100deg, rgba(59,130,246,0.18), rgba(34,197,94,0.12))"
                  : item.disabled
                    ? alpha(theme.palette.common.white, 0.02)
                    : "transparent",
                "&:hover": {
                  background: selected
                    ? "linear-gradient(100deg, rgba(59,130,246,0.22), rgba(34,197,94,0.14))"
                    : alpha(theme.palette.common.white, 0.03),
                },
              }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: selected ? 650 : 500,
                }}
                secondary={
                  item.disabled ? (
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>
                      Coming soon
                    </Typography>
                  ) : null
                }
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />
      <StatusBar />

      <Box
        sx={{
          px: 2.4,
          py: 1.8,
          borderTop: "1px solid var(--border-subtle)",
          background: alpha(theme.palette.background.paper, 0.64),
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{user?.username}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{user?.role}</Typography>
      </Box>
    </Stack>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        color: "text.primary",
      }}
    >
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-subtle)",
          backdropFilter: "blur(12px)",
          boxShadow: "var(--shadow-2)",
          ml: { lg: `${sidebarWidth}px` },
          width: { lg: `calc(100% - ${sidebarWidth}px)` },
        }}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: 72 }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          ) : null}

          <TextField
            size="small"
            placeholder="Ricerca rapida (IP, hash, event id...)"
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleQuickSearchSubmit();
              }
            }}
            sx={{ minWidth: { xs: 140, md: 300 }, flexGrow: 1, maxWidth: 560 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton size="small" onClick={handleQuickSearchSubmit} aria-label="esegui ricerca rapida">
                    <SearchIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            select
            size="small"
            value={selectedCustomerId ?? "all"}
            onChange={(event) => {
              const next = event.target.value;
              setSelectedCustomerId(next === "all" ? null : Number(next));
            }}
            sx={{ minWidth: 230 }}
          >
            <MenuItem value="all">Tutti i clienti</MenuItem>
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </TextField>

          <IconButton
            color="inherit"
            onClick={() => setNotificationDrawerOpen(true)}
            aria-label="notifiche"
            data-testid="notification-bell"
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          <ThemeToggle />

          <Chip
            label={selectedCustomer ? `Cliente: ${selectedCustomer.code}` : "Cliente: ALL"}
            size="small"
            sx={{
              color: theme.palette.primary.light,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
              background: alpha(theme.palette.primary.main, 0.12),
            }}
          />

          <IconButton color="inherit" onClick={() => void handleLogout()} aria-label="logout" data-testid="logout-button">
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
            borderRight: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <NotificationDrawer
        open={notificationDrawerOpen}
        notifications={notifications}
        customers={customers}
        onClose={() => setNotificationDrawerOpen(false)}
        onOpenAlert={(alertId) => {
          navigate(`/alerts/${alertId}`);
          setNotificationDrawerOpen(false);
        }}
        onAck={handleAckNotification}
        onAckAll={handleAckAll}
        onSnooze={handleSnoozeNotification}
      />

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
          px: { xs: 2, md: 3 },
          pt: { xs: 11, md: 12 },
          pb: 3,
          minHeight: "100vh",
          maxHeight: "100vh",
          overflow: "auto",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 1720, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
