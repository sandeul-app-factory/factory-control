ALTER TABLE "PrdVersion"
ADD COLUMN "constraintSnapshot" JSONB,
ADD COLUMN "decisionSnapshot" JSONB,
ADD COLUMN "lockMetadata" JSONB;
