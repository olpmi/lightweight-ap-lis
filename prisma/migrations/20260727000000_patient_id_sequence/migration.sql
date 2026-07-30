-- Patient-identifier allocation moves from a truncated timestamp to a sequence.
--
-- The previous scheme was 'P' + Date.now() truncated to its last seven digits,
-- which repeats every 10,000,000 ms (~2.8 hours). Because patient lookup
-- returned any row matching the generated ID without comparing demographics, a
-- repeat could silently attach a new patient's case to an unrelated record.
CREATE TABLE "patient_sequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "patient_sequence_pkey" PRIMARY KEY ("id")
);

-- Start above every existing identifier so newly allocated IDs cannot collide
-- with rows created under the old scheme (or with the demo seed, which draws
-- 'P' + a random 7-digit number). Identifiers that do not match 'P<digits>'
-- are ignored rather than failing the cast; the digit bound keeps the result
-- inside INTEGER range.
INSERT INTO "patient_sequence" ("id", "last_value")
SELECT 1, COALESCE(MAX(substring("patient_id" from 2)::bigint), 0)
FROM "patient"
WHERE "patient_id" ~ '^P[0-9]{1,9}$';
