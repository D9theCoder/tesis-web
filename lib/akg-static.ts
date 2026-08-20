import type { AkgEdge, AkgNode, AkgSnapshot } from "@/lib/schemas";

/**
 * Deterministic static snapshot of the Attack Knowledge Graph, mirroring
 * `core/knowledge_graph.py`. The AKG is static, predefined and prevalidated —
 * runtime code never mutates it, so this checked-in snapshot is authoritative
 * for rendering traversal. Node/edge structures match the Python graph.
 */

const SURFACE_BY_METHOD: Record<string, string> = {
  sqli_union: "sqli",
  sqli_error: "sqli",
  sqli_boolean_blind: "sqli",
  sqli_time_blind: "sqli",
  ac_idor: "access_control",
  ac_vertical_escalation: "access_control",
  ac_force_browse: "access_control",
  bf_dictionary: "brute_force",
  bf_spray: "brute_force",
};

type NodeDef = [id: string, kind: AkgNode["kind"], surface?: string, method?: string];

const NODE_DEFS: NodeDef[] = [
  ["unauthenticated", "entry"],
  ["sqli", "surface"],
  ["access_control", "surface"],
  ["brute_force", "surface"],
  ["authenticated_session", "outcome"],
  ["sqli_union", "method", "sqli", "sqli_union"],
  ["sqli_error", "method", "sqli", "sqli_error"],
  ["sqli_boolean_blind", "method", "sqli", "sqli_boolean_blind"],
  ["sqli_time_blind", "method", "sqli", "sqli_time_blind"],
  ["ac_idor", "method", "access_control", "ac_idor"],
  ["ac_vertical_escalation", "method", "access_control", "ac_vertical_escalation"],
  ["ac_force_browse", "method", "access_control", "ac_force_browse"],
  ["bf_dictionary", "method", "brute_force", "bf_dictionary"],
  ["bf_spray", "method", "brute_force", "bf_spray"],
  ["sqli_union_confirmed", "confirmed"],
  ["sqli_error_confirmed", "confirmed"],
  ["sqli_boolean_blind_confirmed", "confirmed"],
  ["sqli_time_blind_confirmed", "confirmed"],
  ["ac_idor_confirmed", "confirmed"],
  ["ac_vertical_escalation_confirmed", "confirmed"],
  ["ac_force_browse_confirmed", "confirmed"],
  ["bf_dictionary_confirmed", "confirmed"],
  ["bf_spray_confirmed", "confirmed"],
  ["sqli_confirmed", "confirmed"],
  ["access_control_confirmed", "confirmed"],
  ["brute_force_confirmed", "confirmed"],
  ["credentials_extracted", "outcome"],
  ["admin_session_obtained", "outcome"],
  ["data_exfiltrated", "outcome"],
];

const TARGET_PARAMS: Record<string, string[]> = {
  sqli_union: ["id"],
  sqli_error: ["id"],
  sqli_boolean_blind: ["id"],
  sqli_time_blind: ["id"],
  ac_idor: ["userId"],
  ac_vertical_escalation: ["userId"],
  ac_force_browse: ["path"],
  bf_dictionary: ["credential_pair"],
  bf_spray: ["credential_pair"],
};

const PAYLOAD_PROFILES: Record<string, { seed_payload_refs: string[]; allowed_mutation_types: string[]; expected_success_signals: string[] }> = {
  sqli_union: {
    seed_payload_refs: ["sqli_union_low", "sqli_union_medium", "sqli_union_high"],
    allowed_mutation_types: ["column_count", "comment_style", "encoding", "quote_strategy"],
    expected_success_signals: ["union_result_visible", "data_extraction_evidence"],
  },
  sqli_error: {
    seed_payload_refs: ["sqli_error_low", "sqli_error_medium", "sqli_error_high"],
    allowed_mutation_types: ["error_function_variant", "encoding", "quote_strategy"],
    expected_success_signals: ["database_error_leakage", "schema_evidence"],
  },
  sqli_boolean_blind: {
    seed_payload_refs: ["sqli_boolean_low", "sqli_boolean_medium", "sqli_boolean_high"],
    allowed_mutation_types: ["predicate_variant", "operator_variant", "encoding"],
    expected_success_signals: ["true_false_response_delta"],
  },
  sqli_time_blind: {
    seed_payload_refs: ["sqli_time_low", "sqli_time_medium", "sqli_time_high"],
    allowed_mutation_types: ["delay_function_variant", "threshold_value", "predicate_variant"],
    expected_success_signals: ["measurable_delay"],
  },
  ac_idor: {
    seed_payload_refs: ["ac_idor_low", "ac_idor_medium", "ac_idor_high"],
    allowed_mutation_types: ["object_id_sequence", "encoding", "parameter_alias"],
    expected_success_signals: ["unauthorized_object_access"],
  },
  ac_vertical_escalation: {
    seed_payload_refs: ["ac_vertical_low", "ac_vertical_medium", "ac_vertical_high"],
    allowed_mutation_types: ["role_parameter_variant", "action_parameter_variant"],
    expected_success_signals: ["privileged_action_accessible"],
  },
  ac_force_browse: {
    seed_payload_refs: ["ac_force_browse_low", "ac_force_browse_medium", "ac_force_browse_high"],
    allowed_mutation_types: ["endpoint_ordering", "path_normalization"],
    expected_success_signals: ["restricted_endpoint_accessible"],
  },
  bf_dictionary: {
    seed_payload_refs: ["bf_dictionary_low", "bf_dictionary_medium", "bf_dictionary_high"],
    allowed_mutation_types: ["credential_ordering", "pacing_strategy", "username_priority"],
    expected_success_signals: ["valid_login"],
  },
  bf_spray: {
    seed_payload_refs: ["bf_spray_low", "bf_spray_medium", "bf_spray_high"],
    allowed_mutation_types: ["password_rotation", "account_ordering", "pacing_strategy"],
    expected_success_signals: ["valid_login"],
  },
};

interface TransitionDef {
  source: string;
  target: string;
  isChain?: boolean;
  preconditions?: string[];
  targetAgent?: string;
  priority: number;
}

const TRANSITIONS: TransitionDef[] = [
  { source: "unauthenticated", target: "sqli", priority: 100 },
  { source: "unauthenticated", target: "access_control", priority: 100 },
  { source: "unauthenticated", target: "brute_force", priority: 100 },
  { source: "sqli", target: "sqli_union", priority: 100 },
  { source: "sqli", target: "sqli_error", priority: 100 },
  { source: "sqli", target: "sqli_boolean_blind", priority: 100 },
  { source: "sqli", target: "sqli_time_blind", priority: 100 },
  { source: "access_control", target: "ac_idor", priority: 100 },
  { source: "access_control", target: "ac_vertical_escalation", priority: 100 },
  { source: "access_control", target: "ac_force_browse", priority: 100 },
  { source: "brute_force", target: "bf_dictionary", priority: 100 },
  { source: "brute_force", target: "bf_spray", priority: 100 },
  { source: "sqli_union", target: "sqli_union_confirmed", priority: 50 },
  { source: "sqli_error", target: "sqli_error_confirmed", priority: 50 },
  { source: "sqli_boolean_blind", target: "sqli_boolean_blind_confirmed", priority: 50 },
  { source: "sqli_time_blind", target: "sqli_time_blind_confirmed", priority: 50 },
  { source: "ac_idor", target: "ac_idor_confirmed", priority: 50 },
  { source: "ac_vertical_escalation", target: "ac_vertical_escalation_confirmed", priority: 50 },
  { source: "ac_force_browse", target: "ac_force_browse_confirmed", priority: 50 },
  { source: "bf_dictionary", target: "bf_dictionary_confirmed", priority: 50 },
  { source: "bf_spray", target: "bf_spray_confirmed", priority: 50 },
  { source: "sqli_union_confirmed", target: "sqli_confirmed", priority: 40 },
  { source: "sqli_error_confirmed", target: "sqli_confirmed", priority: 40 },
  { source: "sqli_boolean_blind_confirmed", target: "sqli_confirmed", priority: 40 },
  { source: "sqli_time_blind_confirmed", target: "sqli_confirmed", priority: 40 },
  { source: "ac_idor_confirmed", target: "access_control_confirmed", priority: 40 },
  { source: "ac_vertical_escalation_confirmed", target: "access_control_confirmed", priority: 40 },
  { source: "ac_force_browse_confirmed", target: "access_control_confirmed", priority: 40 },
  { source: "bf_dictionary_confirmed", target: "brute_force_confirmed", priority: 40 },
  { source: "bf_spray_confirmed", target: "brute_force_confirmed", priority: 40 },
  { source: "sqli_confirmed", target: "data_exfiltrated", priority: 30 },
  { source: "brute_force_confirmed", target: "credentials_extracted", priority: 30 },
  { source: "access_control_confirmed", target: "data_exfiltrated", priority: 30 },
  {
    source: "brute_force_confirmed",
    target: "authenticated_session",
    isChain: true,
    preconditions: ["brute_force_confirmed"],
    targetAgent: "ac_idor",
    priority: 10,
  },
  {
    source: "authenticated_session",
    target: "ac_idor",
    isChain: true,
    preconditions: ["authenticated_session"],
    targetAgent: "ac_idor",
    priority: 10,
  },
  {
    source: "credentials_extracted",
    target: "bf_dictionary",
    isChain: true,
    preconditions: ["credentials_extracted"],
    targetAgent: "bf_dictionary",
    priority: 10,
  },
  {
    source: "ac_vertical_escalation_confirmed",
    target: "admin_session_obtained",
    isChain: true,
    preconditions: ["ac_vertical_escalation_confirmed"],
    targetAgent: "sqli_union",
    priority: 10,
  },
  {
    source: "admin_session_obtained",
    target: "sqli_union",
    isChain: true,
    preconditions: ["admin_session_obtained"],
    targetAgent: "sqli_union",
    priority: 10,
  },
];

export function buildAkgSnapshot(): AkgSnapshot {
  const nodes: AkgNode[] = NODE_DEFS.map(([id, kind, surface, method]) => {
    const profile = method ? PAYLOAD_PROFILES[method] : undefined;
    return {
      id,
      kind,
      type: kind,
      surface: surface ?? SURFACE_BY_METHOD[id] ?? undefined,
      method,
      label: id.replace(/_/g, " "),
      payloadProfile: profile
        ? {
            payload_mode: "hybrid",
            seed_payload_refs: profile.seed_payload_refs,
            allowed_mutation_types: profile.allowed_mutation_types,
            target_params: TARGET_PARAMS[method as string] ?? [],
            expected_success_signals: profile.expected_success_signals,
          }
        : undefined,
    };
  });

  const edges: AkgEdge[] = TRANSITIONS.map((t, i) => ({
    id: `akg-e-${i}`,
    source: t.source,
    target: t.target,
    isChain: !!t.isChain,
    preconditions: t.preconditions ?? [],
    targetAgent: t.targetAgent,
    priority: t.priority,
  }));

  return {
    schema_version: "akg-static.v1",
    nodes,
    edges,
  };
}

export const AKG_SNAPSHOT: AkgSnapshot = buildAkgSnapshot();

export function getViableMethodNodes(surface: string | null): string[] {
  if (!surface) return [];
  return NODE_DEFS
    .filter(([, kind, s]) => kind === "method" && s === surface)
    .map(([id]) => id);
}
