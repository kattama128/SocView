import DashboardIcon from "@mui/icons-material/Dashboard";
import DomainIcon from "@mui/icons-material/Domain";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";
import SchemaIcon from "@mui/icons-material/Schema";
import SensorsIcon from "@mui/icons-material/Sensors";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { canManageSources, canManageStates, canManageTags } from "../services/roleUtils";

const drawerWidth = 240;

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            SocView
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
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

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: "64px", ml: `${drawerWidth}px` }}>
        <Outlet />
      </Box>
    </Box>
  );
}
