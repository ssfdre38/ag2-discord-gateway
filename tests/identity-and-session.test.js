import assert from "assert";
import { resolveAuthorContext } from "../src/identity.js";
import { AgySessionManager } from "../src/agy-session.js";
import { config } from "../src/config.js";

console.log("\n=======================================================");
console.log("   🧪 AG2 DISCORD GATEWAY // IDENTITY & SESSION TEST");
console.log("=======================================================\n");

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

// 1. Identity & Grounding Tests
it("correctly authenticates Daniel as verified owner and admin via Discord Snowflake ID", () => {
  const danielUser = {
    id: "119510072865980419",
    username: "ssfdre",
    displayName: "ssfdre"
  };
  const danielMember = {
    displayName: "Daniel"
  };

  const ctx = resolveAuthorContext(danielUser, danielMember);

  assert.strictEqual(ctx.id, "119510072865980419");
  assert.strictEqual(ctx.username, "ssfdre");
  assert.strictEqual(ctx.displayName, "Daniel");
  assert.strictEqual(ctx.isAdmin, true);
  assert.strictEqual(ctx.isOwner, true);
  assert.strictEqual(ctx.isImpersonating, false);
  assert.strictEqual(ctx.canonicalTag, "@ssfdre");
  assert.strictEqual(ctx.memoryAuthorTag, "@ssfdre#119510072865980419");
});

it("classifies Shane with standard nickname as a non-admin community member", () => {
  const shaneUser = {
    id: "987654321098765432",
    username: "shane",
    displayName: "shane"
  };
  const shaneMember = {
    displayName: "Shane"
  };

  const ctx = resolveAuthorContext(shaneUser, shaneMember);

  assert.strictEqual(ctx.id, "987654321098765432");
  assert.strictEqual(ctx.username, "shane");
  assert.strictEqual(ctx.displayName, "Shane");
  assert.strictEqual(ctx.isAdmin, false);
  assert.strictEqual(ctx.isOwner, false);
  assert.strictEqual(ctx.isImpersonating, false);
  assert.strictEqual(ctx.memoryAuthorTag, "@shane#987654321098765432");
});

it("catches Shane impersonating Daniel via server nickname and flags security alert", () => {
  const shaneUser = {
    id: "987654321098765432",
    username: "shane",
    displayName: "shane"
  };
  const spoofedMember = {
    displayName: "Daniel" // Shane sets nickname to Daniel
  };

  const ctx = resolveAuthorContext(shaneUser, spoofedMember);

  assert.strictEqual(ctx.id, "987654321098765432");
  assert.strictEqual(ctx.username, "shane");
  assert.strictEqual(ctx.displayName, "Daniel");
  assert.strictEqual(ctx.isAdmin, false);
  assert.strictEqual(ctx.isOwner, false);
  assert.strictEqual(ctx.isImpersonating, true); // 🚨 Detected!
  assert.ok(ctx.formattedName.includes("Spoofed Nickname"));
  assert.strictEqual(ctx.memoryAuthorTag, "@shane#987654321098765432"); // Never pollutes memory with 'Daniel'
});

it("recognizes Chris as an authorized project collaborator for BarrerAvatarStudio", () => {
  const chrisUser = {
    id: "1227226205544255498",
    username: "driver_2_gamer",
    displayName: "driver_2_gamer"
  };
  const chrisMember = {
    displayName: "Chris"
  };

  const ctx = resolveAuthorContext(chrisUser, chrisMember);

  assert.strictEqual(ctx.id, "1227226205544255498");
  assert.strictEqual(ctx.username, "driver_2_gamer");
  assert.strictEqual(ctx.displayName, "Chris");
  assert.strictEqual(ctx.isAdmin, false);
  assert.strictEqual(ctx.isOwner, false);
  assert.strictEqual(ctx.isImpersonating, false);
  assert.strictEqual(ctx.isCollaborator, true);
  assert.deepStrictEqual(ctx.collaboratorProjects, ["BarrerAvatarStudio"]);
});

it("catches sneaky nickname variations (case insensitive, brackets, ssfdre)", () => {
  const badActor = { id: "123456", username: "troll" };

  const variants = [
    "daniel",
    "DANIEL",
    "ssfdre",
    "[Admin] Shane",
    "Owner",
    "daniel (real)"
  ];

  for (const nick of variants) {
    const ctx = resolveAuthorContext(badActor, { displayName: nick });
    assert.strictEqual(ctx.isImpersonating, true, `Failed to detect impersonation on: "${nick}"`);
    assert.strictEqual(ctx.isAdmin, false);
  }
});

// 2. Session Isolation Tests
it("routes admin turns to sovereign adminConversationId", () => {
  const agy = new AgySessionManager();
  const adminCtx = { id: "119510072865980419", username: "ssfdre", isAdmin: true };

  const resolved = agy.resolveSessionId(adminCtx);
  assert.strictEqual(resolved, agy.adminConversationId);
  assert.strictEqual(resolved, config.conversationId);
});

it("isolates non-admin community members and NEVER grants access to adminConversationId", () => {
  const agy = new AgySessionManager();
  const shaneCtx = { id: "987654321098765432", username: "shane", isAdmin: false };

  // Fresh turn automatically gets an isolated, unique UUID
  const resolvedFresh = agy.resolveSessionId(shaneCtx);
  assert.ok(resolvedFresh); // Auto-generated RFC 4122 UUID ensures CLI never attaches to admin sovereign workspace
  assert.notStrictEqual(resolvedFresh, agy.adminConversationId);

  // Binding a session to Shane
  agy.bindSession("shane-session-uuid-1111", shaneCtx);
  const resolvedBound = agy.resolveSessionId(shaneCtx);
  assert.strictEqual(resolvedBound, "shane-session-uuid-1111");

  // Verify Shane's session is completely separate from admin
  assert.notStrictEqual(resolvedBound, agy.adminConversationId);
});

it("isolates different community members from each other", () => {
  const agy = new AgySessionManager();
  const userA = { id: "user-aaa", username: "alice", isAdmin: false };
  const userB = { id: "user-bbb", username: "bob", isAdmin: false };

  agy.bindSession("alice-session-123", userA);
  agy.bindSession("bob-session-456", userB);

  assert.strictEqual(agy.resolveSessionId(userA), "alice-session-123");
  assert.strictEqual(agy.resolveSessionId(userB), "bob-session-456");
  assert.notStrictEqual(agy.resolveSessionId(userA), agy.resolveSessionId(userB));
});

it("routes dedicated Discord threads to threadSessions", () => {
  const agy = new AgySessionManager();
  const shaneCtx = { id: "987654321098765432", username: "shane", isAdmin: false };
  const threadOptions = { isThread: true, threadId: "thread-9999" };

  agy.bindSession("thread-session-abc", threadOptions);

  const resolved = agy.resolveSessionId(shaneCtx, threadOptions);
  assert.strictEqual(resolved, "thread-session-abc");
});

it("normalizes legacy string author inputs safely with non-admin defaults", () => {
  const agy = new AgySessionManager();
  const normalized = agy._normalizeAuthor("someuser", false);
  assert.strictEqual(normalized.id, "unknown_legacy_id");
  assert.strictEqual(normalized.username, "someuser");
  assert.strictEqual(normalized.isAdmin, false);
  assert.strictEqual(normalized.isOwner, false);
  assert.strictEqual(normalized.isImpersonating, false);
});

it("handles session unbinding/resetting cleanly across admin, thread, and user contexts", () => {
  const agy = new AgySessionManager();
  const user = { id: "user-reset-test", username: "tester", isAdmin: false };
  const thread = { isThread: true, threadId: "thread-reset-test" };

  agy.bindSession("sess-u", user);
  agy.bindSession("sess-t", thread);
  assert.strictEqual(agy.resolveSessionId(user), "sess-u");
  assert.strictEqual(agy.resolveSessionId(null, thread), "sess-t");

  agy.resetSession(user);
  agy.resetSession(thread);
  const nextUserSess = agy.resolveSessionId(user);
  const nextThreadSess = agy.resolveSessionId(null, thread);
  assert.notStrictEqual(nextUserSess, "sess-u");
  assert.notStrictEqual(nextThreadSess, "sess-t");
  assert.notStrictEqual(nextUserSess, agy.adminConversationId);
  assert.ok(nextUserSess);
  assert.ok(nextThreadSess);
});

console.log("\n=======================================================");
console.log(`   TEST RESULTS: ${passed}/${total} PASSED (${total - passed} FAILED)`);
console.log("=======================================================\n");

if (passed !== total) {
  process.exit(1);
}
