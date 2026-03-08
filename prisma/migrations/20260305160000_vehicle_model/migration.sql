-- CreateTable
CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "mileage" INTEGER NOT NULL,
  "vin" TEXT NOT NULL,

  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vehicle_year_positive_check" CHECK ("year" > 0),
  CONSTRAINT "Vehicle_mileage_non_negative_check" CHECK ("mileage" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");
