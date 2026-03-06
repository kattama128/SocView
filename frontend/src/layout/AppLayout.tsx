import DashboardIcon from "@mui/icons-material/Dashboard";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DescriptionIcon from "@mui/icons-material/Description";
import DomainIcon from "@mui/icons-material/Domain";
import GroupsIcon from "@mui/icons-material/Groups";
import InsertChartOutlinedIcon from "@mui/icons-material/InsertChartOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CloseIcon from "@mui/icons-material/Close";
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
  Tooltip,
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
import { canAccessAdmin, canAccessAnalytics, canManageSources } from "../services/roleUtils";
import { ackAllNotifications, ackNotification, fetchNotifications, snoozeNotification } from "../services/alertsApi";
import { NotificationEvent } from "../types/alerts";

const SIDEBAR_WIDTH = 260;
const APPBAR_HEIGHT = 64;
const TRANSITION = "0.2s cubic-bezier(0.4, 0, 0.2, 1)";
const SEEN_CRITICAL_POPUP_IDS_STORAGE_KEY = "socview.seenCriticalPopupIds";

function readSeenCriticalPopupIds(): Set<number> {
  try {
    const raw = window.sessionStorage.getItem(SEEN_CRITICAL_POPUP_IDS_STORAGE_KEY);
    if (!raw) {
      return new Set<number>();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<number>();
    }
    return new Set<number>(
      parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    );
  } catch {
    return new Set<number>();
  }
}

function persistSeenCriticalPopupIds(ids: Set<number>): void {
  try {
    window.sessionStorage.setItem(SEEN_CRITICAL_POPUP_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // best effort
  }
}

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
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupNotification, setPopupNotification] = useState<NotificationEvent | null>(null);
  const [quickSearch, setQuickSearch] = useState("");

  const seenPopupIdsRef = useRef<Set<number>>(readSeenCriticalPopupIds());

  const markPopupSeen = useCallback((notificationId: number) => {
    if (seenPopupIdsRef.current.has(notificationId)) {
      return;
    }
    seenPopupIdsRef.current.add(notificationId);
    persistSeenCriticalPopupIds(seenPopupIdsRef.current);
  }, []);

  const items = useMemo<MenuItemLink[]>(() => {
    const analyticsEnabled = canAccessAnalytics(user?.role, user?.permissions);
    const adminEnabled = canAccessAdmin(user?.role, user?.permissions);
    const sourcesEnabled = canManageSources(user?.role, user?.permissions);
    const menu: MenuItemLink[] = [
      { label: "Dashboard", icon: <DashboardIcon />, to: "/" },
      { label: "Active Alarms", icon: <DomainIcon />, to: "/active-alarms" },
      { label: "Ricerca Alert", icon: <ManageSearchIcon />, to: "/search" },
      { label: "Sources", icon: <StorageIcon />, to: "/sources" },
      { label: "Parsers", icon: <DataObjectIcon />, to: "/parsers", disabled: !sourcesEnabled },
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

      const criticalUnreadIds = new Set(
        response.results.filter((item) => !item.is_read && item.severity === "critical").map((item) => item.id),
      );
      setPopupNotification((current) => {
        if (current && criticalUnreadIds.has(current.id)) {
          return current;
        }

        const nextCriticalUnread = response.results.find(
          (item) => !item.is_read && item.severity === "critical" && !seenPopupIdsRef.current.has(item.id),
        );
        if (nextCriticalUnread) {
          markPopupSeen(nextCriticalUnread.id);
          return nextCriticalUnread;
        }
        return null;
      });
    } catch {
      setNotifications([]);
      setUnreadCount(0);
      setPopupNotification(null);
    }
  }, [markPopupSeen]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      seenPopupIdsRef.current = new Set<number>();
      try {
        window.sessionStorage.removeItem(SEEN_CRITICAL_POPUP_IDS_STORAGE_KEY);
      } catch {
        // best effort
      }
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

  /* ─── Sidebar ─── */
  const drawerContent = (
    <Stack sx={{ height: "100%", color: "text.primary" }}>
      {/* Brand */}
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.25)}`,
              flexShrink: 0,
            }}
          >
            <ShieldOutlinedIcon sx={{ color: "#fff", fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              SocView
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", fontWeight: 500 }}>
              SOC Operations Platform
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Customer context */}
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Box
          sx={{
            borderRadius: 2,
            p: 1.5,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            background: alpha(theme.palette.primary.main, 0.05),
            transition: `background ${TRANSITION}`,
          }}
        >
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary", mb: 0.25 }}>
            Contesto cliente
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.code})` : "Tutti i clienti"}
          </Typography>
        </Box>
      </Box>

      {/* Navigation */}
      <Box sx={{ px: 1.5, flex: 1, overflowY: "auto" }}>
        <Typography
          sx={{
            fontSize: "0.625rem",
            fontWeight: 600,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            px: 1,
            mb: 0.75,
          }}
        >
          Menu
        </Typography>
        <List disablePadding>
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
                  mb: 0.4,
                  borderRadius: 2,
                  py: 0.85,
                  color: item.disabled ? "text.disabled" : selected ? theme.palette.primary.main : "text.secondary",
                  fontWeight: selected ? 600 : 500,
                  background: selected
                    ? alpha(theme.palette.primary.main, isDark ? 0.1 : 0.06)
                    : "transparent",
                  border: "1px solid transparent",
                  transition: `all ${TRANSITION}`,
                  "&:hover": {
                    background: selected
                      ? alpha(theme.palette.primary.main, isDark ? 0.14 : 0.08)
                      : alpha(theme.palette.text.primary, 0.04),
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: "inherit",
                    minWidth: 36,
                    "& .MuiSvgIcon-root": { fontSize: "1.25rem" },
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: "0.8125rem",
                    fontWeight: selected ? 600 : 500,
                  }}
                  secondary={
                    item.disabled ? (
                      <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.625rem" }}>
                        Coming soon
                      </Typography>
                    ) : null
                  }
                />
                {selected && (
                  <Box
                    sx={{
                      width: 3,
                      height: 20,
                      borderRadius: 999,
                      background: theme.palette.primary.main,
                      ml: 1,
                      flexShrink: 0,
                    }}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      {/* Status Bar */}
      <StatusBar />

      {/* User info */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
            fontSize: "0.8125rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {user?.username?.charAt(0).toUpperCase() ?? "U"}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.username}
          </Typography>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{user?.role}</Typography>
        </Box>
        <Tooltip title="Logout">
          <IconButton
            size="small"
            onClick={() => void handleLogout()}
            aria-label="logout"
            sx={{ color: "text.secondary" }}
          >
            <LogoutIcon sx={{ fontSize: "1.1rem" }} />
          </IconButton>
        </Tooltip>
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
      {/* AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
          background: isDark ? "rgba(12,20,37,0.8)" : "rgba(255,255,255,0.85)",
          borderBottom: "1px solid var(--border-subtle)",
          backdropFilter: "blur(16px)",
          ml: { lg: `${SIDEBAR_WIDTH}px` },
          width: { lg: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: `${APPBAR_HEIGHT}px !important`, px: { xs: 1.5, md: 2.5 } }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileDrawerOpen(true)} sx={{ mr: 0.5 }}>
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
            sx={{
              minWidth: { xs: 120, md: 280 },
              flexGrow: 1,
              maxWidth: 480,
              "& .MuiOutlinedInput-root": {
                height: 38,
                fontSize: "0.8125rem",
              },
            }}
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

          <Box sx={{ flex: 1 }} />

          <TextField
            select
            size="small"
            value={selectedCustomerId ?? "all"}
            onChange={(event) => {
              const next = event.target.value;
              setSelectedCustomerId(next === "all" ? null : Number(next));
            }}
            sx={{
              minWidth: 200,
              "& .MuiOutlinedInput-root": {
                height: 38,
                fontSize: "0.8125rem",
              },
            }}
          >
            <MenuItem value="all">Tutti i clienti</MenuItem>
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </TextField>

          <Tooltip title="Notifiche">
            <IconButton
              color="inherit"
              onClick={() => setNotificationDrawerOpen(true)}
              aria-label="notifiche"
              data-testid="notification-bell"
              sx={{
                color: "text.secondary",
                transition: `color ${TRANSITION}`,
                "&:hover": { color: "text.primary" },
              }}
            >
              <Badge
                badgeContent={unreadCount}
                color="error"
                sx={{ "& .MuiBadge-badge": { fontSize: "0.65rem", minWidth: 18, height: 18 } }}
              >
                <NotificationsIcon sx={{ fontSize: "1.3rem" }} />
              </Badge>
            </IconButton>
          </Tooltip>

          <ThemeToggle />

          <Tooltip title="Logout">
            <IconButton
              color="inherit"
              onClick={() => void handleLogout()}
              aria-label="logout"
              data-testid="logout-button"
              sx={{
                display: { xs: "inline-flex", lg: "none" },
                color: "text.secondary",
                transition: `color ${TRANSITION}`,
                "&:hover": { color: "text.primary" },
              }}
            >
              <LogoutIcon sx={{ fontSize: "1.2rem" }} />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Sidebar drawer */}
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileDrawerOpen : true}
        onClose={() => setMobileDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
            borderRight: `1px solid var(--border-subtle)`,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Notification drawer */}
      <NotificationDrawer
        open={notificationDrawerOpen}
        notifications={notifications}
        customers={customers}
        onClose={() => setNotificationDrawerOpen(false)}
        onOpenAlert={(alertId) => {
          navigate(`/alerts/${alertId}`);
          setPopupNotification(null);
          setNotificationDrawerOpen(false);
        }}
        onAck={handleAckNotification}
        onAckAll={handleAckAll}
        onSnooze={handleSnoozeNotification}
      />

      {/* Critical notification popup */}
      <Snackbar
        open={Boolean(popupNotification)}
        autoHideDuration={8000}
        onClose={() => setPopupNotification(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          data-testid="critical-popup-alert"
          severity="error"
          variant="filled"
          sx={{ width: "100%", borderRadius: 2.5 }}
          action={
            popupNotification ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  size="small"
                  color="inherit"
                  data-testid="critical-popup-open-alert"
                  onClick={() => {
                    if (popupNotification) {
                      markPopupSeen(popupNotification.id);
                      void ackNotification(popupNotification.id);
                    }
                    navigate(`/alerts/${popupNotification.alert}`);
                    setPopupNotification(null);
                  }}
                >
                  Apri
                </Button>
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label="chiudi popup critico"
                  data-testid="critical-popup-close-button"
                  onClick={() => {
                    if (popupNotification) {
                      markPopupSeen(popupNotification.id);
                    }
                    setPopupNotification(null);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : null
          }
        >
          {popupNotification?.title || popupNotification?.alert_title || "Alert critico"}
        </Alert>
      </Snackbar>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2, md: 3 },
          pt: `${APPBAR_HEIGHT + 24}px`,
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
