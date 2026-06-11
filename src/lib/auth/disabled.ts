// Off-boarding gate for interactive login. A soft-disabled user (user.disabledAt
// set by api/users/[id] PATCH {disabled:true}) must NOT be able to sign in, even
// with the correct password. Kept as a tiny pure helper so the rule is unit-tested
// independently of the NextAuth Credentials closure in auth.ts.
export function isUserDisabled(user: { disabledAt?: Date | null } | null | undefined): boolean {
  return !!user?.disabledAt;
}
