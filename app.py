
import streamlit as st
import pandas as pd
import pydeck as pdk

st.set_page_config(
    page_title="Texas Data Center Intelligence",
    page_icon="⚡",
    layout="wide"
)

# -----------------------
# LOAD DATA
# -----------------------

@st.cache_data
def load_data():
    return pd.read_csv("texas_datacenter_projects.csv")

df = load_data()


# -----------------------
# HEADER
# -----------------------

st.title("⚡ Texas Data Center Intelligence")

st.caption(
    "Live intelligence for Texas data-center infrastructure, "
    "power demand and early-stage gas-to-power opportunities."
)


# -----------------------
# SIDEBAR FILTER
# -----------------------

st.sidebar.header("Filters")

stage_options = sorted(df["stage"].dropna().unique())

selected_stage = st.sidebar.multiselect(
    "Project Stage",
    stage_options,
    default=stage_options
)

power_options = sorted(df["power_type"].dropna().unique())

selected_power = st.sidebar.multiselect(
    "Power Type",
    power_options,
    default=power_options
)

min_mw, max_mw = st.sidebar.slider(
    "Estimated MW",
    min_value=int(df["estimated_mw"].min()),
    max_value=int(df["estimated_mw"].max()),
    value=(
        int(df["estimated_mw"].min()),
        int(df["estimated_mw"].max())
    )
)


# -----------------------
# FILTER DATA
# -----------------------

filtered_df = df[
    (df["stage"].isin(selected_stage))
    &
    (df["power_type"].isin(selected_power))
    &
    (df["estimated_mw"] >= min_mw)
    &
    (df["estimated_mw"] <= max_mw)
]


# -----------------------
# KPI CARDS
# -----------------------

col1, col2, col3, col4 = st.columns(4)

col1.metric(
    "Projects",
    len(filtered_df)
)

col2.metric(
    "Estimated MW",
    f"{filtered_df['estimated_mw'].sum():,.0f}"
)

col3.metric(
    "Early Stage",
    len(filtered_df[
        filtered_df["stage"] == "Early Stage"
    ])
)

col4.metric(
    "Gas / BTM Opportunities",
    filtered_df["power_type"]
    .str.contains("Gas", case=False, na=False)
    .sum()
)


# -----------------------
# MAP
# -----------------------

st.subheader("Texas Infrastructure Map")

layer = pdk.Layer(
    "ScatterplotLayer",
    data=filtered_df,
    get_position="[longitude, latitude]",
    get_radius="estimated_mw * 250",
    pickable=True,
    auto_highlight=True,
    opacity=0.7,
)

view_state = pdk.ViewState(
    latitude=31.0,
    longitude=-98.0,
    zoom=5.3,
    pitch=0,
)

tooltip = {
    "html": """
    <b>{project_name}</b><br/>
    Developer: {developer}<br/>
    Stage: {stage}<br/>
    MW: {estimated_mw}<br/>
    Power: {power_type}<br/>
    Latest: {latest_signal}
    """,
    "style": {
        "backgroundColor": "steelblue",
        "color": "white"
    }
}

deck = pdk.Deck(
    layers=[layer],
    initial_view_state=view_state,
    tooltip=tooltip
)

st.pydeck_chart(deck)


# -----------------------
# PROJECT TABLE
# -----------------------

st.subheader("Project Pipeline")

display_columns = [
    "project_name",
    "developer",
    "city",
    "estimated_mw",
    "stage",
    "power_type",
    "latest_signal",
    "last_updated"
]

st.dataframe(
    filtered_df[display_columns],
    use_container_width=True,
    hide_index=True
)


# -----------------------
# PROJECT DETAIL
# -----------------------

st.subheader("Project Intelligence")

if len(filtered_df) > 0:

    selected_project = st.selectbox(
        "Select Project",
        filtered_df["project_name"].tolist()
    )

    project = filtered_df[
        filtered_df["project_name"] == selected_project
    ].iloc[0]

    left, right = st.columns(2)

    with left:

        st.markdown(
            f"""
### {project['project_name']}

**Developer:** {project['developer']}

**Location:** {project['city']}, {project['county']} County

**Estimated Power Demand:** {project['estimated_mw']} MW

**Stage:** {project['stage']}

**Power Strategy:** {project['power_type']}
"""
        )

    with right:

        st.markdown(
            f"""
### Intelligence Signals

**ERCOT**

{project['ercot_status']}

**Permit**

{project['permit_status']}

**Latest Signal**

{project['latest_signal']}

**Source**

{project['source']}

**Last Updated**

{project['last_updated']}
"""
        )


# -----------------------
# STAGE EXPLANATION
# -----------------------

st.divider()

st.subheader("Stage Intelligence")

st.markdown(
"""
The platform infers project maturity from multiple signals:

**Early Stage**
→ land acquisition, announcements, developer activity

**Permitting**
→ air permits, environmental filings, utility filings

**Interconnection**
→ ERCOT queue or utility interconnection signals

**Construction**
→ EPC activity, equipment orders, construction reports

**Operational**
→ energized / commissioned capacity
"""
)
