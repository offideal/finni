import React from "react";
import {
  useGetEmissionSources,
  useSyncEmissionSource,
  getGetEmissionFactorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * Admin-only: trigger sync of external CO₂ bundles into the tenant emission factor catalog.
 * Editors then pick factors as usual; versions keep snapshot values after lock.
 */
export function ExternalCo2AdminCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: sources, isLoading } = useGetEmissionSources();
  const sync = useSyncEmissionSource();

  const invalidateFactors = () => {
    void queryClient.invalidateQueries({ queryKey: getGetEmissionFactorsQueryKey() });
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">External CO₂ data sources</CardTitle>
        <CardDescription>
          Sync pulls factors into your tenant catalog. Locked versions keep historical snapshots; re-sync only affects
          new selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sources…
          </div>
        ) : !sources?.length ? (
          <p className="text-sm text-muted-foreground">No external sources registered.</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-sm">{s.displayName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{s.key}</p>
                  {!s.hasHandler ? <Badge variant="secondary">No driver</Badge> : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!s.hasHandler || sync.isPending}
                  onClick={() => {
                    sync.mutate(
                      { key: s.key },
                      {
                        onSuccess: (r) => {
                          toast({
                            title: "Sync complete",
                            description: `Updated ${r.upserted} factor row(s) from ${r.sourceKey}.`,
                          });
                          invalidateFactors();
                        },
                        onError: (e: unknown) => {
                          toast({
                            variant: "destructive",
                            title: "Sync failed",
                            description: e instanceof Error ? e.message : "Request failed",
                          });
                        },
                      },
                    );
                  }}
                >
                  {sync.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sync now
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
