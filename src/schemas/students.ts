import { z } from "zod";
import { DEPARTMENTS } from "./users";

export const updateStudentDepartmentSchema = z.object({
  department: z.enum(DEPARTMENTS),
});
