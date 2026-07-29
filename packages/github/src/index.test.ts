import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FakeGithubAdapter, verifyGithubWebhook } from "./index.js";

describe("GitHub adapter security", () => {
  it("validates the exact webhook body signature", () => {
    const payload = Buffer.from('{"action":"opened"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(payload).digest("hex")}`;
    expect(verifyGithubWebhook(payload, signature, "secret")).toBe(true);
    expect(verifyGithubWebhook(Buffer.from("tampered"), signature, "secret")).toBe(false);
  });

  it("provides deterministic fake repositories and pull requests", async () => {
    const adapter = new FakeGithubAdapter();
    const repository = await adapter.createRepository({
      owner: "sandeul",
      name: "sample",
      description: "sample",
      private: true,
    });
    const pull = await adapter.createPullRequest(
      repository.owner,
      repository.name,
      "Factory task",
      "body",
      "factory/task",
      "main",
    );
    expect(pull.number).toBe(1);
    await expect(adapter.listPullRequests("sandeul", "sample")).resolves.toHaveLength(1);
  });

  it("keeps repository IDs unique and stable across adapter restarts", async () => {
    const input = {
      owner: "sandeul",
      name: "stable-factory-app",
      description: "test",
      private: true,
    };
    const first = await new FakeGithubAdapter().createRepository(input);
    const second = await new FakeGithubAdapter().createRepository(input);
    const other = await new FakeGithubAdapter().createRepository({
      ...input,
      name: "another-factory-app",
    });

    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(other.id);
  });
});
