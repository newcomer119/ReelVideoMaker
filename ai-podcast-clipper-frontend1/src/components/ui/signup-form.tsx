"use client";
import { cn } from "~/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./field";
import z, { set } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import Link from "next/link";
import { signupSchema, type SignupFormValues } from "~/schemas/auth";




export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const[error,setError] = useState<string | null>(null);
  const[isSubMitting,setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (data: SignupFormValues) => {
    try{
      setIsSubmitting(true);
      setError(null)
    }catch(error){
      setError("An unexpected error has occurred ")
    }finally{

    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Sign up </CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">(errors.email.message)</p>
                )}
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-red-500">
                    (errors.password.message)
                  </p>
                )}
                {error && <p className="text-sm text-red-500 rounded-md bg-red-50 ">{error}</p>}
              </Field>
              <Field>
                <Button type="submit" disabled={isSubMitting}>{isSubMitting ? "Signing Up..." : "Sign Up"}</Button>
                <FieldDescription className="text-center">
                  Already have an account? <Link href="/login">Sign In</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
