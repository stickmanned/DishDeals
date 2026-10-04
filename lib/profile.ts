import type { Id } from "../convex/_generated/dataModel";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

export function validateDisplayName(raw: string): string {
  const name = raw.trim();
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
    throw new Error(
      `Display name must be ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters`,
    );
  }
  return name;
}

// Minimal structural slice of Convex's reader/writer so the profile rules
// can be tested without a deployment.
export type ProfileRow = {
  _id: Id<"profiles">;
  userId: Id<"users">;
  displayName: string;
  walletAddress?: string;
};

export interface ProfileDb {
  getProfileByUser(userId: Id<"users">): Promise<ProfileRow | null>;
  insertProfile(row: Omit<ProfileRow, "_id">): Promise<Id<"profiles">>;
  patchProfile(
    id: Id<"profiles">,
    fields: { displayName: string; walletAddress?: string },
  ): Promise<void>;
}

export function requireUserId(userId: Id<"users"> | null): Id<"users"> {
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

// walletAddress undefined = keep the stored wallet; a non-empty string
// replaces it. Never clears an existing wallet.
export async function upsertProfileCore(
  db: ProfileDb,
  userId: Id<"users"> | null,
  input: { displayName: string; walletAddress?: string },
): Promise<Id<"profiles">> {
  const uid = requireUserId(userId);
  const displayName = validateDisplayName(input.displayName);
  const wallet = input.walletAddress?.trim() || undefined;
  const existing = await db.getProfileByUser(uid);
  if (existing) {
    await db.patchProfile(existing._id, {
      displayName,
      ...(wallet !== undefined ? { walletAddress: wallet } : {}),
    });
    return existing._id;
  }
  return db.insertProfile({
    userId: uid,
    displayName,
    ...(wallet !== undefined ? { walletAddress: wallet } : {}),
  });
}

export type MeResult = {
  userId: Id<"users">;
  displayName: string;
  walletAddress?: string;
};

// Canonical users.me shape: flat, or null when signed out or no profile yet.
export async function meCore(
  db: Pick<ProfileDb, "getProfileByUser">,
  userId: Id<"users"> | null,
): Promise<MeResult | null> {
  if (userId === null) return null;
  const profile = await db.getProfileByUser(userId);
  if (!profile) return null;
  return {
    userId,
    displayName: profile.displayName,
    ...(profile.walletAddress !== undefined
      ? { walletAddress: profile.walletAddress }
      : {}),
  };
}
