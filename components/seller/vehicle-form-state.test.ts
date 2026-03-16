import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_VEHICLE_FORM, hasVehicleFormUnsavedChanges, toVehicleFormValues } from "@/components/seller/vehicle-form-state";

test("hasVehicleFormUnsavedChanges returns false for the untouched form", () => {
  const initialValues = toVehicleFormValues();

  assert.equal(
    hasVehicleFormUnsavedChanges(initialValues, {
      values: toVehicleFormValues(),
      hasPendingPhotoUploads: false,
      hasPendingMulkiyaFrontUpload: false,
      hasPendingMulkiyaBackUpload: false,
    }),
    false,
  );
});

test("hasVehicleFormUnsavedChanges returns true when field values change", () => {
  assert.equal(
    hasVehicleFormUnsavedChanges(EMPTY_VEHICLE_FORM, {
      values: {
        ...EMPTY_VEHICLE_FORM,
        brand: "Toyota",
        model: "Land Cruiser",
      },
      hasPendingPhotoUploads: false,
      hasPendingMulkiyaFrontUpload: false,
      hasPendingMulkiyaBackUpload: false,
    }),
    true,
  );
});

test("hasVehicleFormUnsavedChanges returns true when uploads are staged", () => {
  assert.equal(
    hasVehicleFormUnsavedChanges(EMPTY_VEHICLE_FORM, {
      values: EMPTY_VEHICLE_FORM,
      hasPendingPhotoUploads: true,
      hasPendingMulkiyaFrontUpload: false,
      hasPendingMulkiyaBackUpload: false,
    }),
    true,
  );
});

test("hasVehicleFormUnsavedChanges ignores damage map key order", () => {
  const initialValues = toVehicleFormValues({
    damageMap: {
      hood: "MINOR",
      door_front_left: "MAJOR",
    },
  });

  assert.equal(
    hasVehicleFormUnsavedChanges(initialValues, {
      values: toVehicleFormValues({
        damageMap: {
          door_front_left: "MAJOR",
          hood: "MINOR",
        },
      }),
      hasPendingPhotoUploads: false,
      hasPendingMulkiyaFrontUpload: false,
      hasPendingMulkiyaBackUpload: false,
    }),
    false,
  );
});
