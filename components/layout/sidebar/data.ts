import {
  LucideDownload,
  LucideFileVideo2,
  LucideHome,
  LucideListVideo,
  LucideScanLine,
  LucideUser,
  LucideVideo,
  Settings,
} from "lucide-react";
import { YouTubeIcon } from "./icons";
import type { MenuGroup } from "./types";

export function getSidebarMenuGroups(): MenuGroup[] {
  return [
    {
      label: "App",
      items: [
        {
          title: "Home",
          icon: LucideHome,
          url: "/home",
        },
        {
          title: "Youtube",
          icon: YouTubeIcon,
          items: [
            {
              title: "Download",
              icon: LucideDownload,
              items: [
                {
                  title: "Video",
                  url: "/youtube/download/video",
                  icon: LucideFileVideo2,
                },
                {
                  title: "Playlist",
                  url: "/youtube/download/playlist",
                  icon: LucideListVideo,
                },
                {
                  title: "Channel",
                  url: "/youtube/download/channel",
                  icon: LucideUser,
                },
              ],
            },
          ],
        },
        {
          title: "Video Tools",
          icon: LucideVideo,
          items: [
            {
              title: "Converter",
              icon: LucideScanLine,
              url: "/video/convert",
            },
          ],
        },
      ],
    },
    {
      label: "System",
      items: [
        {
          title: "Settings",
          icon: Settings,
          url: "/settings",
        },
      ],
    },
  ];
}
