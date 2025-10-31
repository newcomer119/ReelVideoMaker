"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Button } from "./button";
import { Badge } from "./badge";
import { CreditCard } from "lucide-react";

export function BillingClient({ currentCredits }: { currentCredits: number }) {
  const creditPackages = [
    {
      id: "pack1",
      name: "Starter Pack",
      credits: 50,
      price: "$9.99",
      popular: false,
    },
    {
      id: "pack2",
      name: "Pro Pack",
      credits: 150,
      price: "$24.99",
      popular: true,
    },
    {
      id: "pack3",
      name: "Enterprise Pack",
      credits: 500,
      price: "$79.99",
      popular: false,
    },
  ];

  const handlePurchase = (packageId: string) => {
    // TODO: Implement payment integration (Stripe, etc.)
    alert(`Purchase flow for ${packageId} - Coming soon!`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing & Credits</h1>
        <p className="text-muted-foreground">
          Purchase credits to continue generating AI clips
        </p>
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Credits
            </CardTitle>
            <CardDescription>Your remaining credits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-lg px-4 py-2">
                {currentCredits} credits
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-6">Purchase Credits</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {creditPackages.map((pkg) => (
            <Card
              key={pkg.id}
              className={`relative ${
                pkg.popular
                  ? "border-primary shadow-lg scale-105"
                  : "hover:border-primary/50"
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="px-3 py-1">Most Popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-center">{pkg.name}</CardTitle>
                <CardDescription className="text-center">
                  <span className="text-3xl font-bold text-foreground">
                    {pkg.credits}
                  </span>{" "}
                  credits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold">{pkg.price}</div>
                  <div className="text-sm text-muted-foreground">
                    {(
                      Number.parseFloat(pkg.price.replace("$", "")) / pkg.credits
                    ).toFixed(2)}{" "}
                    per credit
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant={pkg.popular ? "default" : "outline"}
                  onClick={() => handlePurchase(pkg.id)}
                >
                  Purchase
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>💳 Payment integration coming soon</p>
        <p className="mt-2">
          For now, you can contact support to purchase credits
        </p>
      </div>
    </div>
  );
}

