"""Project RadarOrigination MVP — evidence-backed Texas energy-project intelligence."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pandas as pd
import pydeck as pdk
import streamlit as st

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from radar.services.dashboard_service import (
    ensure_bootstrapped,
    event_frame,
    health_summary,
    project_story,
    projects_frame,
    refresh_snapshot,
    review_candidates,
    timeline_bounds,
)


st.set_page_config(page_title="Project Radar | Texas Energy Intelligence", layout="wide", initial_sidebar_state="expanded")

STAGE_COLORS = {
    "Concept": [240, 178, 41],
    "Construction": [238, 90, 90],
    "COD": [53, 196, 130],
    "Withdrawn": [130, 142, 160],
    "Unknown": [104, 125, 150],
}


def inject_theme() -> None:
    st.markdown(
        """
        <style>
        .stApp { background: #08111f; color: #e9f2ff; }
        [data-testid="stSidebar"] { background: #0c1728; border-right: 1px solid #1e3350; }
        [data-testid="stMetric"] { background: #0d1c30; border: 1px solid #203c60; padding: 0.7rem; border-radius: 0.5rem; }
        h1, h2, h3 { color: #f1f6ff !important; letter-spacing: -0.02em; }
        .eyebrow { color: #5ad5ff; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
        .subtle { color: #a5b8d3; }
        .status-pill { display: inline-block; color: #8cf2bd; border: 1px solid #277a58; background: #0c2c24; padding: 0.25rem 0.55rem; border-radius: 1rem; font-size: 0.78rem; font-weight: 700; }
        .stage-pill { display: inline-block; color: #dbe9ff; border: 1px solid #36537a; background: #12243b; padding: 0.2rem 0.5rem; border-radius: 1rem; font-size: 0.78rem; font-weight: 700; }
        .story-card { border-left: 3px solid #46c7ff; padding: 0.15rem 0 0.15rem 0.85rem; margin: 0.45rem 0; }
        .stButton button { border-radius: 0.4rem; border-color: #277ca8; color: #dff5ff; background: #0f3350; }
        </style>
        """,
        unsafe_allow_html=True,
    )


def display_number(value: float | int | None, suffix: str = "") -> str:
    if value is None or pd.isna(value):
        return "—"
    return f"{value:,.0f}{suffix}"


def map_deck(frame: pd.DataFrame) -> pdk.Deck:
    mapped = frame.dropna(subset=["latitude", "longitude"]).copy()
    if mapped.empty:
        mapped = pd.DataFrame(
            [{"latitude": 31.0, "longitude": -98.0, "marker_radius": 1, "marker_color": [0, 0, 0], "project_name": "No projects"}]
        )
    else:
        mapped["marker_color"] = mapped["radar_stage"].map(STAGE_COLORS).apply(lambda value: value or STAGE_COLORS["Unknown"])
        mapped["marker_radius"] = mapped["estimated_mw"].fillna(15).clip(lower=8) * 360

    layer = pdk.Layer(
        "ScatterplotLayer",
        data=mapped,
        get_position="[longitude, latitude]",
        get_radius="marker_radius",
        get_fill_color="marker_color",
        get_line_color=[230, 245, 255],
        line_width_min_pixels=1,
        pickable=True,
        auto_highlight=True,
        opacity=0.82,
        stroked=True,
    )
    return pdk.Deck(
        layers=[layer],
        initial_view_state=pdk.ViewState(latitude=31.0, longitude=-98.0, zoom=5.3, pitch=0),
        map_style="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        tooltip={
            "html": "<b>{project_name}</b><br/>Radar stage: {radar_stage}<br/>Confidence: {stage_confidence}<br/>Capacity: {estimated_mw} MW<br/>County: {county}",
            "style": {"backgroundColor": "#102a44", "color": "#f2f7ff"},
        },
    )


def render_feed(events: pd.DataFrame) -> None:
    st.markdown("<div class='eyebrow'>Live intelligence feed</div>", unsafe_allow_html=True)
    st.subheader("What changed")
    if events.empty:
        st.info("No events have been recorded for the selected time window.")
        return
    for _, event in events.iterrows():
        with st.container(border=True):
            headline = event["title"]
            st.markdown(f"**{headline}**")
            st.caption(f"{event['project_name']} · {event['occurred_at'].strftime('%b %d, %Y')} · {event['stage']}")
            st.write(event["detail"])
            if event["confidence_delta"] is not None and not pd.isna(event["confidence_delta"]):
                st.caption(f"Confidence delta: {event['confidence_delta']:+.2f}")
            if event["source_url"]:
                st.link_button("Open source", event["source_url"], use_container_width=True)


def render_project_story(project_id: str) -> None:
    story = project_story(project_id)
    if story is None:
        st.warning("The selected project is no longer available in the current filtered view.")
        return

    st.markdown("<div class='eyebrow'>Project intelligence</div>", unsafe_allow_html=True)
    st.subheader(story["name"])
    overview, provenance = st.columns([1.05, 0.95])
    with overview:
        st.markdown(f"<span class='stage-pill'>{story['radar_stage']} · {story['confidence']:.0%} confidence</span>", unsafe_allow_html=True)
        st.write("")
        st.write(f"**Developer:** {story['developer']}")
        st.write(f"**County:** {story['county']}")
        st.write(f"**Estimated capacity:** {display_number(story['estimated_mw'], ' MW')}")
        st.write(f"**Power type:** {story['power_type']}")
        st.write(f"**Source status:** {story['source_stage']}")
    with provenance:
        st.markdown("**Why Radar thinks this**")
        st.write(story["latest_signal"])
        st.write(f"**ERCOT:** {story['ercot_status']}")
        st.write(f"**Permit:** {story['permit_status']}")
        if story["source_url"]:
            st.link_button("View current source", story["source_url"], use_container_width=True)

    st.markdown("#### Evidence timeline")
    for item in story["timeline"]:
        st.markdown(
            f"<div class='story-card'><b>{item['date'].strftime('%b %d, %Y')}</b> · {item['title']}<br/><span class='subtle'>{item['detail']}</span></div>",
            unsafe_allow_html=True,
        )

    with st.expander("Inspect retained source evidence", expanded=False):
        for evidence in story["evidence"]:
            st.markdown(f"**{evidence['source']}** · {evidence['published_at'].strftime('%b %d, %Y')}")
            if evidence["url"]:
                st.markdown(f"[Open original source]({evidence['url']})")
            for signal in evidence["signals"]:
                st.write(f"• {signal}")
            st.json(evidence["raw_payload"], expanded=False)


def main() -> None:
    inject_theme()
    ensure_bootstrapped()

    health = health_summary()
    st.markdown("<div class='eyebrow'>Texas energy project intelligence</div>", unsafe_allow_html=True)
    title_col, action_col = st.columns([0.8, 0.2])
    with title_col:
        st.title("Project Radar")
        st.markdown("<span class='subtle'>Evidence-backed monitoring for Texas data-center infrastructure and power opportunity.</span>", unsafe_allow_html=True)
    with action_col:
        st.write("")
        if st.button("Refresh snapshot", use_container_width=True, help="Re-ingest the committed source snapshot and record a health check."):
            result = refresh_snapshot()
            st.success(f"{result['status'].title()}: {result['message']}")
            st.rerun()

    last_checked = health.get("last_checked")
    last_text = last_checked.strftime("%b %d, %Y %H:%M UTC") if last_checked else "not yet checked"
    st.markdown(f"<span class='status-pill'>SOURCE HEALTH · {health.get('status', 'unknown').upper()} · LAST CHECKED {last_text}</span>", unsafe_allow_html=True)
    st.write("")

    lower_bound, upper_bound = timeline_bounds()
    all_projects = projects_frame()
    with st.sidebar:
        st.markdown("<div class='eyebrow'>Situation controls</div>", unsafe_allow_html=True)
        st.subheader("Explore the portfolio")
        selected_date = st.slider("Replay intelligence as of", min_value=lower_bound, max_value=upper_bound, value=upper_bound)
        stage_options = sorted(all_projects["radar_stage"].dropna().unique().tolist()) if not all_projects.empty else []
        selected_stages = st.multiselect("Radar stage", stage_options, default=stage_options)
        power_options = sorted(all_projects["power_type"].dropna().unique().tolist()) if not all_projects.empty else []
        selected_power = st.multiselect("Power type", power_options, default=power_options)
        capacity_values = all_projects["estimated_mw"].dropna() if not all_projects.empty else pd.Series(dtype=float)
        minimum_mw = float(capacity_values.min()) if not capacity_values.empty else 0.0
        maximum_mw = float(capacity_values.max()) if not capacity_values.empty else 1.0
        selected_mw = st.slider("Minimum estimated MW", min_value=minimum_mw, max_value=max(maximum_mw, minimum_mw + 1), value=minimum_mw)
        st.divider()
        st.caption("The committed CSV is a source snapshot. Radar retains its evidence, maps source statuses to confidence-bounded stages, and records each ingestion run.")

    frame = projects_frame(selected_stages, selected_power, selected_mw, selected_date)
    events = event_frame(selected_date)
    total_mw = frame["estimated_mw"].sum(skipna=True) if not frame.empty else 0
    concepts = int((frame["radar_stage"] == "Concept").sum()) if not frame.empty else 0
    operational = int((frame["radar_stage"] == "COD").sum()) if not frame.empty else 0

    metrics = st.columns(4)
    metrics[0].metric("Projects visible", len(frame), help="Projects active in the selected filters and time window.")
    metrics[1].metric("Estimated MW", display_number(total_mw), help="Sum excludes rows without an estimated MW value.")
    metrics[2].metric("Concept signals", concepts)
    metrics[3].metric("Match reviews", health.get("review_count", 0), help="Potential record relationships awaiting evidence; never auto-merged.")

    map_col, feed_col = st.columns([1.65, 0.75], gap="large")
    with map_col:
        st.markdown("<div class='eyebrow'>Map intelligence</div>", unsafe_allow_html=True)
        st.subheader(f"Texas project landscape · {selected_date.strftime('%b %d, %Y')}")
        st.pydeck_chart(map_deck(frame), use_container_width=True)
        st.caption("Marker color: amber = Concept, red = Construction, green = COD, gray = Withdrawn/unknown. Marker size scales with reported MW.")
    with feed_col:
        render_feed(events)

    st.divider()
    story_col, review_col = st.columns([1.45, 0.55], gap="large")
    with story_col:
        if frame.empty:
            st.info("Adjust the time control or filters to open a project story.")
        else:
            options = dict(zip(frame["project_name"], frame["id"]))
            selected_name = st.selectbox("Open a project story", list(options.keys()))
            render_project_story(options[selected_name])
    with review_col:
        st.markdown("<div class='eyebrow'>Quality controls</div>", unsafe_allow_html=True)
        st.subheader("Entity review")
        candidates = review_candidates()
        if candidates.empty:
            st.caption("No ambiguous pairs currently require review.")
        else:
            for _, candidate in candidates.iterrows():
                with st.container(border=True):
                    st.markdown(f"**{candidate['candidate']}**")
                    st.caption(f"Review score {candidate['score']:.0%}")
                    st.write(candidate["explanation"])
                    with st.expander("Matching features"):
                        st.json(candidate["features"])

    st.divider()
    st.markdown("#### Pipeline contract")
    st.caption("Source snapshot → immutable source document → normalized signal → conservative match candidate → stage assessment → map/event projection. The application never presents an inferred stage without retained evidence.")


if __name__ == "__main__":
    main()
