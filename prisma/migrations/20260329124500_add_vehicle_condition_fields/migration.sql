-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "condition_grade" TEXT,
ADD COLUMN     "cylinders" INTEGER,
ADD COLUMN     "estimated_value" DECIMAL(18,2),
ADD COLUMN     "loss_type" TEXT,
ADD COLUMN     "manufactured_in" TEXT,
ADD COLUMN     "number_of_keys" INTEGER,
ADD COLUMN     "primary_damage" TEXT,
ADD COLUMN     "series" TEXT,
ADD COLUMN     "start_code" TEXT,
ADD COLUMN     "tire_condition" INTEGER,
ADD COLUMN     "title_status" TEXT,
ADD COLUMN     "warranty_status" TEXT;
