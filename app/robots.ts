import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/help"],
        disallow: [
          "/workspaces/",
          "/api/",
          "/new/",
          "/dashboard",
          "/calendar",
          "/settings",
          "/profile/",
        ],
      },
    ],
    sitemap: "https://scribblapp.ca/sitemap.xml",
  };
}
