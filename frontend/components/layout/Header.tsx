"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LogoutIcon from "@mui/icons-material/Logout";
import ChatIcon from "@mui/icons-material/Chat";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { useKeycloak } from "@/lib/keycloak/KeycloakProvider";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";

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
  const pathname = usePathname();
  const t = useTranslations('common');
  const { user } = useAuthStore();
  const { logout } = useKeycloak();
  const { data: organizations } = useOrganizations();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Show back button to organizations if not already on organizations page
  const shouldShowBackToOrgs = !showBackButton && pathname !== '/organizations' && pathname.startsWith('/organizations/');
  const handleBackToOrganizations = () => {
    router.push('/organizations');
  };

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
    handleMenuClose();
    logout();
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
            aria-label={t('backToOrganizations')}
          >
            <ArrowBackIcon />
          </IconButton>
        )}
        {shouldShowBackToOrgs && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleBackToOrganizations}
            sx={{ mr: 2 }}
            aria-label={t('backToOrganizations')}
            title={t('backToOrganizations')}
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

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* User Avatar */}
        <IconButton onClick={handleMenuOpen}>
          <Avatar sx={{ width: 36, height: 36 }}>
            {user?.name?.charAt(0) || "U"}
          </Avatar>
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
              primary={<Typography variant="caption" color="text.secondary">{t('account')}</Typography>}
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
