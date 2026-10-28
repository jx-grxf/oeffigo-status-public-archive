"use client";

import { Button } from "@openstatus/ui/components/ui/button";
import { Input } from "@openstatus/ui/components/ui/input";
import { Label } from "@openstatus/ui/components/ui/label";
import { Textarea } from "@openstatus/ui/components/ui/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  Section,
  SectionDescription,
  SectionGroup,
  SectionHeader,
  SectionTitle,
} from "@/components/content/section";
import { useTRPC } from "@/lib/trpc/client";

type Kind = "report" | "update" | "maintenance";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const pageId = Number.parseInt(id);
  const trpc = useTRPC();
  const { data, refetch } = useQuery(
    trpc.statusTranslation.list.queryOptions({ pageId }),
  );

  if (!data) return null;

  return (
    <SectionGroup>
      <Section>
        <SectionHeader>
          <SectionTitle>English copy</SectionTitle>
          <SectionDescription>
            The English status page shows these texts instead of the German
            originals. Anything left empty stays German and is marked as such.
            Saving here sends no notification.
          </SectionDescription>
        </SectionHeader>
      </Section>
      <Section>
        <SectionHeader>
          <SectionTitle>Status reports</SectionTitle>
        </SectionHeader>
        {data.reports.length === 0 ? (
          <p className="text-muted-foreground text-sm">No status reports.</p>
        ) : null}
        {data.reports.map((report) => (
          <div key={report.id} className="grid gap-4 rounded-lg border p-4">
            <TranslationField
              kind="report"
              refId={report.id}
              field="title"
              label="Title"
              german={report.title}
              english={report.englishTitle}
              onSaved={refetch}
            />
            {report.updates.map((update) => (
              <TranslationField
                key={update.id}
                kind="update"
                refId={update.id}
                field="message"
                label={`Update · ${update.status} · ${update.date.toLocaleString("de-AT", { timeZone: "Europe/Vienna" })}`}
                german={update.message}
                english={update.englishMessage}
                onSaved={refetch}
              />
            ))}
          </div>
        ))}
      </Section>
      <Section>
        <SectionHeader>
          <SectionTitle>Maintenances</SectionTitle>
        </SectionHeader>
        {data.maintenances.length === 0 ? (
          <p className="text-muted-foreground text-sm">No maintenances.</p>
        ) : null}
        {data.maintenances.map((maintenance) => (
          <div
            key={maintenance.id}
            className="grid gap-4 rounded-lg border p-4"
          >
            <TranslationField
              kind="maintenance"
              refId={maintenance.id}
              field="title"
              label="Title"
              german={maintenance.title}
              english={maintenance.englishTitle}
              onSaved={refetch}
            />
            <TranslationField
              kind="maintenance"
              refId={maintenance.id}
              field="message"
              label="Message"
              german={maintenance.message}
              english={maintenance.englishMessage}
              onSaved={refetch}
            />
          </div>
        ))}
      </Section>
    </SectionGroup>
  );
}

function TranslationField({
  kind,
  refId,
  field,
  label,
  german,
  english,
  onSaved,
}: {
  kind: Kind;
  refId: number;
  field: "title" | "message";
  label: string;
  german: string;
  english: string | null;
  onSaved: () => void;
}) {
  const trpc = useTRPC();
  const inputId = useId();
  const [value, setValue] = useState(english ?? "");
  const mutation = useMutation(
    trpc.statusTranslation.upsert.mutationOptions({ onSuccess: onSaved }),
  );
  const dirty = value.trim() !== (english ?? "");

  const save = () =>
    toast.promise(mutation.mutateAsync({ kind, refId, [field]: value }), {
      loading: "Saving…",
      success: value.trim() ? "English copy saved" : "English copy removed",
      error: "Could not save the English copy",
    });

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <p
        lang="de"
        className="text-muted-foreground text-sm whitespace-pre-wrap"
      >
        {german}
      </p>
      {field === "title" ? (
        <Input
          id={inputId}
          lang="en"
          maxLength={256}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <Textarea
          id={inputId}
          lang="en"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || mutation.isPending}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
