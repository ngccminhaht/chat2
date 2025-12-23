"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Badge,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import NotificationsIcon from "@mui/icons-material/Notifications";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import ChatIcon from "@mui/icons-material/Chat";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";

interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  title?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  currentOrgSlug?: string;
}

export default function Header({
  onMenuClick,
  showMenuButton = true,
  title = "miAgent",
  showBackButton = false,
  onBackClick,
  currentOrgSlug,
}: HeaderProps) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { data: organizations } = useOrganizations();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOrgSelect = (slug: string) => {
    handleMenuClose();
    router.push(`/organizations/${slug}/conversations`);
  };

  const handleProfile = () => {
    handleMenuClose();
    router.push("/settings/profile");
  };

  const handleLogout = () => {
    clearAuth();
    handleMenuClose();
    router.push("/login");
  };

  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <Toolbar>
        {showBackButton && onBackClick && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={onBackClick}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
        )}
        {showMenuButton && onMenuClick && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuClick}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>

        {/* User Avatar */}
        <IconButton onClick={handleMenuOpen} sx={{ mr: 1 }}>
          <Avatar sx={{ width: 36, height: 36 }}>
            {user?.name?.charAt(0) || "U"}
          </Avatar>
        </IconButton>

        {/* Notifications */}
        <IconButton color="inherit">
          <Badge badgeContent={0} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>

        {/* Dropdown Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          {/* Organizations section */}
          {organizations?.map((org) => (
            <MenuItem
              key={org.id}
              selected={org.slug === currentOrgSlug}
              onClick={() => handleOrgSelect(org.slug)}
            >
              <ListItemIcon>
                <Avatar sx={{ width: 28, height: 28 }}>
                  <ChatIcon fontSize="small" />
                </Avatar>
              </ListItemIcon>
              <ListItemText primary={org.name} />
            </MenuItem>
          ))}
          {organizations && organizations.length > 0 && <Divider />}

          {/* Account section - Profile + Logout in one row */}
          <MenuItem onClick={handleProfile} sx={{ minWidth: 250 }}>
            <ListItemIcon>
              <Avatar sx={{ width: 32, height: 32 }}>
                {user?.name?.charAt(0) || "U"}
              </Avatar>
            </ListItemIcon>
            <ListItemText
              primary={<Typography variant="caption" color="text.secondary">Tài khoản</Typography>}
              secondary={user?.name}
            />
            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
