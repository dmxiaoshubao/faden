import test from "node:test"
import assert from "node:assert/strict"

import { normalizePathForMatching } from "../path-utils"

test("normalizePathForMatching trims trailing slash", () => {
  assert.equal(
    normalizePathForMatching("/Users/zhen/work/"),
    "/Users/zhen/work",
  )
})
