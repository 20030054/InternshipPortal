// Explicit, not relied on implicitly: Next's own SWC build (and Vitest,
// once configured for the automatic runtime — see D-086) never needs
// this, but plain `tsx` CLI invocations (this file's own live-
// verification script, run inside a container) default to the classic
// JSX transform, which does, and fail with "React is not defined"
// without it.
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { CaseSummaryData } from "./case-summary";

void React;

/**
 * §10: "Printed artefacts: case summary PDF... all carrying BNU/SCIT
 * identification and generated server-side." One of the three named
 * artefacts — the supervisor-evaluation PDF and annual report are
 * additive, out of scope this session (docs/modules/M13.md "Scope
 * decisions").
 */
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#16262B" },
  header: { marginBottom: 20, borderBottom: "2pt solid #0E3B43", paddingBottom: 10 },
  eyebrow: { fontSize: 9, color: "#5C6F75", marginBottom: 2 },
  title: { fontSize: 18, color: "#0E3B43" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, color: "#0E3B43", marginBottom: 6, fontWeight: 700 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 140, color: "#5C6F75" },
  value: { flex: 1 },
  step: { flexDirection: "row", marginBottom: 2 },
  stepStatus: { width: 70 },
  grade: { marginTop: 4, fontSize: 13, fontWeight: 700 },
});

function formatDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

function CaseSummaryDocument({ data }: { data: CaseSummaryData }) {
  return (
    <Document title={`Case summary — ${data.studentName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            School of Computer &amp; Information Technology · Beaconhouse National University
          </Text>
          <Text style={styles.title}>Internship case summary</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Student</Text>
            <Text style={styles.value}>{data.studentName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Registration number</Text>
            <Text style={styles.value}>{data.registrationNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Programme</Text>
            <Text style={styles.value}>{data.programme}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Company</Text>
            <Text style={styles.value}>{data.companyName ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Planned dates</Text>
            <Text style={styles.value}>
              {formatDate(data.plannedStart)} – {formatDate(data.plannedEnd)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Actual dates</Text>
            <Text style={styles.value}>
              {formatDate(data.actualStart)} – {formatDate(data.actualEnd)}
            </Text>
          </View>
        </View>

        {data.workDescription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work description</Text>
            <Text>{data.workDescription}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          {data.progress.type === "normal" ? (
            data.progress.steps.map((step) => (
              <View key={step.step} style={styles.step}>
                <Text style={styles.stepStatus}>
                  {step.status === "done" ? "Done" : step.status === "current" ? "Current" : "Upcoming"}
                </Text>
                <Text>
                  {step.step}. {step.label}
                </Text>
              </View>
            ))
          ) : (
            <Text>{data.progress.label}</Text>
          )}
        </View>

        {data.grade && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Grade</Text>
            <Text style={styles.grade}>{data.grade.value === "P" ? "Pass" : "Incomplete"}</Text>
            <Text>Awarded {formatDate(data.grade.awardedAt)}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderCaseSummaryPdf(data: CaseSummaryData): Promise<Buffer> {
  return renderToBuffer(<CaseSummaryDocument data={data} />);
}
