"use server";

import { hashPassword } from "~/lib/auth";
import { signupSchema, type SignupFormValues } from "~/schemas/auth";
import { db } from "~/server/db";

type SignupResult = {
  success: boolean;
  error?: string;
};

export async function signUp(data: SignupFormValues): Promise<SignupResult> {
  const validationResult = signupSchema.safeParse(data);
  if (!validationResult.success) {
    return {
      success: false,
      error: validationResult.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { email, password } = validationResult.data;

  try {
    const existingUser = await db.user.findUnique({ where: { email } });

    if (existingUser) {
      return {
        success: false,
        error: "Email already in use",
      };
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: {
        email,
        password: hashedPassword,
        credits: 10, // Give new users 10 credits by default
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Signup error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "An error occurred during signup" 
    };
  }
}
