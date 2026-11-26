import type { EquipItem } from "@wga/ui";

export type PublicConfig = {
  api_base_url: string;
  wow_root: string;
  auto_upload: boolean;
  username: string;
  guild_id: string;
  guild_name: string;
  has_token: boolean;
};

export type LogRow = { level: string; message: string; at: string };

export type SnapGuild = {
  name?: string;
  rank?: string;
  rank_index?: number;
  is_leader?: boolean;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
};

export type SnapEquipItem = EquipItem & { iconFileId?: number };

export type SnapEquipSet = {
  id?: number;
  name?: string;
  icon_file_id?: number;
  is_equipped?: boolean;
  items?: SnapEquipItem[];
};

export type SnapTalentTipLine = {
  left?: string;
  right?: string;
  color?: { r?: number; g?: number; b?: number };
};

export type SnapTalentNode = {
  node_id?: number;
  tree_id?: number;
  group_id?: number;
  pos_x?: number;
  pos_y?: number;
  rank?: number;
  max_rank?: number;
  name?: string;
  spell_id?: number;
  icon_file_id?: number;
  tooltip_lines?: SnapTalentTipLine[];
  description?: string;
};

export type SnapTalentTab = {
  group_id?: number;
  name?: string;
  icon_file_id?: number;
  order_index?: number;
  points_spent?: number;
  nodes?: SnapTalentNode[];
};

export type SnapTalentGroup = {
  index?: number;
  name?: string;
  active?: boolean;
  config_name?: string;
  tree_id?: number;
  trees?: Array<{ tree_id?: number; points_spent?: number }>;
  tabs?: SnapTalentTab[];
  nodes?: SnapTalentNode[];
};

export type SnapCharacter = {
  name?: string;
  realm?: string;
  race?: string;
  class?: string;
  spec?: string;
  level?: number;
  item_level?: number;
};

export type SnapshotPayload = {
  captured_at?: string;
  addon_version?: string;
  character?: SnapCharacter;
  guild?: SnapGuild | null;
  equipment?: SnapEquipItem[];
  equipment_sets?: SnapEquipSet[];
  talents?: {
    loadout_string?: string;
    spec_id?: number;
    groups?: SnapTalentGroup[];
  };
  lockouts?: Array<{
    instance_name?: string;
    difficulty?: string;
    bosses_killed?: number;
    bosses_total?: number;
    reset_at?: string;
  }>;
  professions?: Array<{
    name?: string;
    skill_current?: number;
    skill_max?: number;
  }>;
  quests?: Array<{
    quest_id?: number;
    title?: string;
    level?: number;
    is_complete?: boolean;
    objectives?: Array<{ text?: string; finished?: boolean }>;
  }>;
};

export type LocalSnapshot = {
  path: string;
  hash: string;
  payload: SnapshotPayload;
};

export type GuildLookup = {
  status: string;
  id?: string;
  name?: string;
  verification_status?: string;
  is_member?: boolean;
  is_owner?: boolean;
  role?: string;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
  guild_name?: string;
  is_leader?: boolean;
  character_name?: string;
};

export type MyGuild = {
  id: string;
  name: string;
  role: string;
  verification_status?: string;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
};

export type MePayload = {
  user?: { is_admin?: boolean };
  guilds: MyGuild[];
};

export type JoinApp = {
  id: string;
  username: string;
  display_name?: string;
  message?: string;
  created_at: string;
};

export type PendingGuild = {
  id: string;
  name: string;
  flavor: string;
  region_key: string;
  realm_name: string;
  created_by?: string;
};

export type PendingClaim = {
  id: string;
  guild_name: string;
  username: string;
  character_name?: string;
  realm_name?: string;
};

export type CaptchaPayload = { captcha_id: string; image: string };

export type IconSrc = { b64?: string; source?: string; ms?: number };
