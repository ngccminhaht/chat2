"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select, MenuItem, FormControl } from "@mui/material";
import { locales, type Locale } from "@/i18n/config";

export default function LanguageSwitcher() {
  const router = useRouter();
  const t = useTranslations("language");
  const [currentLocale, setCurrentLocale] = useState<Locale>("vi");

  // Get current locale from cookie on mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      const cookieValue = document.cookie
        .split("; ")
        .find((row) => row.startsWith("NEXT_LOCALE="))
        ?.split("=")[1];
      if (cookieValue && locales.includes(cookieValue as Locale)) {
        setCurrentLocale(cookieValue as Locale);
      }
    }
  }, []);

  const handleLanguageChange = (event: { target: { value: string } }) => {
    const locale = event.target.value as Locale;
    // Set cookie
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`; // 1 year
    setCurrentLocale(locale);

    // Reload page to apply new locale
    router.refresh();
  };

  return (
    <FormControl size="small" sx={{ minWidth: 120 }}>
      <Select
        value={currentLocale}
        onChange={handleLanguageChange}
        sx={{
          color: "white",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(10px)",
          borderRadius: "8px",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.2)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.3)",
          },
          "& .MuiSvgIcon-root": {
            color: "white",
          },
        }}
      >
        {locales.map((locale) => (
          <MenuItem key={locale} value={locale}>
            {t(locale)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
