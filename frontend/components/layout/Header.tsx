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

import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AppsIcon from "@mui/icons-material/Apps";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import Badge from "@mui/material/Badge";
import Tooltip from "@mui/material/Tooltip";

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

  // User initials for Haravan pill
  const userInitial = user?.name?.charAt(0)?.toUpperCase() || "U";
  const userShort = user?.name ? (user.name.split(" ").length > 1 ? user.name.split(" ").slice(-2).join(" ") : user.name) : "User";

  return (
    <AppBar
      className="organization-header"
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: "#ffffff", borderBottom: "1px solid #dfe3e8" }}
    >
      <Toolbar sx={{ minHeight: "48px !important", height: 48, px: { xs: 1.5, sm: 2 } }}>
        {showBackButton && onBackClick && (
          <IconButton
            size="small"
            edge="start"
            onClick={onBackClick}
            sx={{ mr: 1, color: "#637381" }}
            aria-label={t("backToOrganizations")}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        {shouldShowBackToOrgs && (
          <IconButton
            size="small"
            edge="start"
            onClick={handleBackToOrganizations}
            sx={{ mr: 1, color: "#637381" }}
            aria-label={t("backToOrganizations")}
            title={t("backToOrganizations")}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        {showMenuButton && onMenuClick && (
          <IconButton
            size="small"
            edge="start"
            onClick={onMenuClick}
            sx={{ mr: 1, display: { md: "none" }, color: "#637381" }}
            aria-label={t("openNavigation")}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        )}

        {/* Haravan style Brand */}
        <Box className="organization-brand" sx={{ display: "flex", alignItems: "center", width: 176, cursor: "pointer" }} onClick={() => router.push(currentOrgSlug ? `/organizations/${currentOrgSlug}/conversations` : "/organizations")}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              bgcolor: "#0060df",
              color: "#ffffff",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            m
          </Box>
          <Typography
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: 15,
              color: "#0060df",
              letterSpacing: "-0.2px",
              display: "flex",
              alignItems: "center",
              ml: 1,
            }}
          >
            miAgent
            <Box component="span" sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#0060df", ml: 0.5 }} />
          </Typography>
        </Box>

        {/* Breadcrumb subtitle */}
        <Box className="organization-header-context" sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", ml: 2 }}>
          <Typography variant="body2" sx={{ color: "#637381", fontSize: "12.5px" }}>
            {pageTitle}
          </Typography>
          {organization?.name && (
            <Typography variant="caption" sx={{ color: "#8c9196", ml: 1, pl: 1, borderLeft: "1px solid #dfe3e8" }}>
              {organization.name}
            </Typography>
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Right utility icons matching Haravan header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Trợ giúp">
            <IconButton size="small" sx={{ color: "#637381" }}>
              <HelpOutlineIcon sx={{ fontSize: 19 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Góp ý">
            <IconButton size="small" sx={{ color: "#637381", display: { xs: "none", sm: "inline-flex" } }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Ứng dụng">
            <IconButton size="small" sx={{ color: "#637381", display: { xs: "none", sm: "inline-flex" } }}>
              <AppsIcon sx={{ fontSize: 19 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Thông báo">
            <IconButton size="small" sx={{ color: "#637381" }}>
              <Badge color="error" variant="dot">
                <NotificationsNoneIcon sx={{ fontSize: 20 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Haravan user pill on the right */}
          <Box
            onClick={handleMenuOpen}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              py: 0.4,
              px: 1,
              ml: 0.5,
              borderRadius: "20px",
              cursor: "pointer",
              bgcolor: "transparent",
              transition: "background-color 0.15s",
              "&:hover": { bgcolor: "#f1f3f5" },
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                fontSize: "12.5px",
                color: "#202223",
                display: { xs: "none", md: "block" },
              }}
            >
              {userShort}
            </Typography>
            <Avatar
              sx={{
                width: 28,
                height: 28,
                bgcolor: "#00a65a",
                fontSize: 12,
                fontWeight: 600,
                color: "#ffffff",
              }}
            >
              {userInitial}
            </Avatar>
          </Box>
        </Box>

        {/* Dropdown Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem onClick={handleProfile} sx={{ minWidth: 220, py: 1 }}>
            <ListItemIcon>
              <Avatar sx={{ width: 30, height: 30, bgcolor: "#00a65a", fontSize: 12 }}>
                {userInitial}
              </Avatar>
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography variant="caption" color="text.secondary">
                  {t("account")}
                </Typography>
              }
              secondary={<Typography variant="body2" sx={{ fontWeight: 600, fontSize: "12.5px" }}>{user?.name}</Typography>}
            />
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleLogout} sx={{ color: "error.main", fontSize: "12.5px" }}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText primary={t("logout") || "Đăng xuất"} primaryTypographyProps={{ fontSize: "12.5px" }} />
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
