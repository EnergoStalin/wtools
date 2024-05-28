import { WakatimeProject } from "../wakatime"

export declare interface ProjectPager {
  data: WakatimeProject[];
  error: any;
  total: number;
  total_pages: number;
  page: number;
  prev_page: null;
  next_page: number;
}

export declare interface Project {
  id: string;
  name: string;
  color: null;
  first_heartbeat_at: null;
  last_heartbeat_at: Date;
  created_at: Date;
  badge: ProjectBadge | null;
  clients: any[];
  human_readable_last_heartbeat_at: string;
  url: string;
  repository: null;
  has_public_url: boolean;
  urlencoded_name: string;
  human_readable_first_heartbeat_at: null;
}

export declare interface ProjectBadge {
  id: string;
  project_id: string;
  created_at: Date;
  url: string;
  left_text: string;
  title: string;
  snippets: BadgeSnippet[];
  link: string;
  color: string;
}

export declare interface BadgeSnippet {
  name: string;
  content: string;
}
