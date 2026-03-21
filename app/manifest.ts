import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NestMind",
    short_name: "NestMind",
    description: "宝宝成长与教育管理系统（移动端优先）",
    start_url: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#f5f2ed",
    theme_color: "#0a0a0a",
    orientation: "portrait",
  };
}
