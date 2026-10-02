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
  Box,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuthStore } from "@/features/auth/stores/authStore";
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
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const organizationsT = useTranslations("organizations");
  const user = useAuthStore((state) => state.user);
  const organization = useAuthStore((state) => state.organization);
  const { logout } = useKeycloak();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const pageTitle = pathname === "/organizations/new" ? organizationsT("createNew")
    : pathname === "/organizations" ? organizationsT("select")
    : pathname.includes("/conversations") ? nav("conversations")
    : pathname.includes("/customers") ? nav("customers")
    : pathname.includes("/channels") ? nav("channels")
    : pathname.includes("/quick-replies") ? nav("quickReplies")
    : pathname.includes("/members") ? nav("members")
    : pathname.includes("/integrations") ? nav("integrations")
    : pathname.includes("/settings") ? nav("settings")
    : pathname.includes("/widget") ? nav("widget")
    : title;

  // Show back button to organizations if not already on organizations page
  const shouldShowBackToOrgs =
    !showBackButton &&
    pathname !== "/organizations" &&
    pathname.startsWith("/organizations/");
  const handleBackToOrganizations = () => {
    router.push("/organizations");
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
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
      className="organization-header"
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
            aria-label={t("backToOrganizations")}
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
            aria-label={t("backToOrganizations")}
            title={t("backToOrganizations")}
          >
            <ArrowBackIcon />
          </IconButton>
        )}
        {showMenuButton && onMenuClick && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuClick}
            sx={{ mr: 2, display: { md: "none" } }}
            aria-label={t("openNavigation")}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Box className="organization-brand" aria-label="miAgent">
          <span className="organization-brand-mark" aria-hidden="true">m</span>
          <Typography component="span" className="organization-brand-name">miAgent</Typography>
        </Box>
        <span className="organization-header-divider" aria-hidden="true" />
        <Box className="organization-header-context">
          <Typography variant="h6" component="h1">{pageTitle}</Typography>
          {organization?.name && <Typography variant="caption">{organization.name}</Typography>}
        </Box>

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
          {/* Account section - Profile + Logout in one row */}
          <MenuItem onClick={handleProfile} sx={{ minWidth: 250 }}>
            <ListItemIcon>
              <Avatar sx={{ width: 32, height: 32 }}>
                {user?.name?.charAt(0) || "U"}
              </Avatar>
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography variant="caption" color="text.secondary">
                  {t("account")}
                </Typography>
              }
              secondary={user?.name}
            />
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
              }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
