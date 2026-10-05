# =====================================================================
# Part E: Azure portal dashboard for the ChatOps bot
#
# Every tile is a KQL query over the bot's custom events in Application
# Insights (BotRequest, ToolCall, OpenAITokens, ContentFiltered, ...):
#   - Requests per hour (by channel)      - Tool-call breakdown
#   - OpenAI tokens per day               - Request outcomes
#   - Error rate %                        - Latency (avg / p95)
#   - Tool-call details table
# =====================================================================

locals {
  tiles = [
    {
      title = "Requests per hour", sub = "BotRequest events by channel"
      x = 0, y = 1, w = 6, h = 4, chart = "StackedColumn"
      query = <<-KQL
        customEvents
        | where name == "BotRequest"
        | summarize requests = count() by bin(timestamp, 1h), channel = tostring(customDimensions.channel)
        | order by timestamp asc
      KQL
      dims = {
        xAxis = { name = "timestamp", type = "datetime" }
        yAxis = [{ name = "requests", type = "long" }]
        splitBy = [{ name = "channel", type = "string" }]
        aggregation = "Sum"
      }
    },
    {
      title = "Tool-call breakdown", sub = "Calls per tool"
      x = 6, y = 1, w = 6, h = 4, chart = "Pie"
      query = <<-KQL
        customEvents
        | where name == "ToolCall"
        | summarize calls = count() by tool = tostring(customDimensions.tool)
        | order by calls desc
      KQL
      dims = {
        xAxis = { name = "tool", type = "string" }
        yAxis = [{ name = "calls", type = "long" }]
        splitBy = []
        aggregation = "Sum"
      }
    },
    {
      title = "OpenAI tokens per day", sub = "Prompt vs completion tokens (gpt-4o)"
      x = 0, y = 5, w = 6, h = 4, chart = "StackedColumn"
      query = <<-KQL
        customEvents
        | where name == "OpenAITokens"
        | summarize promptTokens = sum(todouble(customMeasurements.promptTokens)),
                    completionTokens = sum(todouble(customMeasurements.completionTokens))
                    by bin(timestamp, 1d)
        | order by timestamp asc
      KQL
      dims = {
        xAxis = { name = "timestamp", type = "datetime" }
        yAxis = [{ name = "promptTokens", type = "real" }, { name = "completionTokens", type = "real" }]
        splitBy = []
        aggregation = "Sum"
      }
    },
    {
      title = "Request outcomes", sub = "ok / content_filtered / rate_limited / confirmation / error"
      x = 6, y = 5, w = 6, h = 4, chart = "Pie"
      query = <<-KQL
        customEvents
        | where name == "BotRequest"
        | summarize requests = count() by outcome = tostring(customDimensions.outcome)
        | order by requests desc
      KQL
      dims = {
        xAxis = { name = "outcome", type = "string" }
        yAxis = [{ name = "requests", type = "long" }]
        splitBy = []
        aggregation = "Sum"
      }
    },
    {
      title = "Error rate %", sub = "BotRequest outcome == error, per hour"
      x = 0, y = 9, w = 6, h = 4, chart = "Line"
      query = <<-KQL
        customEvents
        | where name == "BotRequest"
        | summarize requests = count(), errors = countif(tostring(customDimensions.outcome) == "error") by bin(timestamp, 1h)
        | extend errorRatePct = round(100.0 * errors / requests, 2)
        | project timestamp, errorRatePct
        | order by timestamp asc
      KQL
      dims = {
        xAxis = { name = "timestamp", type = "datetime" }
        yAxis = [{ name = "errorRatePct", type = "real" }]
        splitBy = []
        aggregation = "Avg"
      }
    },
    {
      title = "Latency (ms)", sub = "End-to-end bot response time, avg and p95 per hour"
      x = 6, y = 9, w = 6, h = 4, chart = "Line"
      query = <<-KQL
        customEvents
        | where name == "BotRequest"
        | summarize avgMs = round(avg(todouble(customMeasurements.durationMs)), 0),
                    p95Ms = round(percentile(todouble(customMeasurements.durationMs), 95), 0)
                    by bin(timestamp, 1h)
        | order by timestamp asc
      KQL
      dims = {
        xAxis = { name = "timestamp", type = "datetime" }
        yAxis = [{ name = "avgMs", type = "real" }, { name = "p95Ms", type = "real" }]
        splitBy = []
        aggregation = "Avg"
      }
    },
    {
      title = "Tool calls - details", sub = "Calls, failures and average duration per tool"
      x = 0, y = 13, w = 12, h = 3, chart = "Grid"
      query = <<-KQL
        customEvents
        | where name == "ToolCall"
        | summarize calls = count(),
                    failed = countif(tostring(customDimensions.success) == "false"),
                    avgDurationMs = round(avg(todouble(customMeasurements.durationMs)), 0)
                    by tool = tostring(customDimensions.tool)
        | order by calls desc
      KQL
      dims = {
        xAxis = { name = "tool", type = "string" }
        yAxis = [{ name = "calls", type = "long" }]
        splitBy = []
        aggregation = "Sum"
      }
    },
  ]

  header = {
    "0" = {
      position = { x = 0, y = 0, colSpan = 12, rowSpan = 1 }
      metadata = {
        inputs = []
        type   = "Extension/HubsExtension/PartType/MarkdownPart"
        settings = {
          content = {
            settings = {
              content        = "## ${var.title}\nAzure OpenAI (gpt-4o) ChatOps bot - telemetry from **${var.app_insights_name}** (custom events). Time range: last 7 days."
              title          = ""
              subtitle       = ""
              markdownSource = 1
            }
          }
        }
      }
    }
  }

  query_parts = {
    for i, t in local.tiles : tostring(i + 1) => {
      position = { x = t.x, y = t.y, colSpan = t.w, rowSpan = t.h }
      metadata = {
        inputs = [
          { name = "resourceTypeMode", isOptional = true },
          { name = "ComponentId", isOptional = true },
          { name = "Scope", value = { resourceIds = [var.app_insights_id] }, isOptional = true },
          { name = "PartId", value = uuidv5("url", "${var.name}/tile/${i}"), isOptional = true },
          { name = "Version", value = "2.0", isOptional = true },
          { name = "TimeRange", value = "P7D", isOptional = true },
          { name = "DashboardId", isOptional = true },
          { name = "DraftRequestParameters", isOptional = true },
          { name = "Query", value = t.query, isOptional = true },
          { name = "ControlType", value = t.chart == "Grid" ? "AnalyticsGrid" : "FrameControlChart", isOptional = true },
          { name = "SpecificChart", value = t.chart == "Grid" ? "Line" : t.chart, isOptional = true },
          { name = "PartTitle", value = "Analytics", isOptional = true },
          { name = "PartSubTitle", value = var.app_insights_name, isOptional = true },
          { name = "Dimensions", value = t.dims, isOptional = true },
          { name = "LegendOptions", value = { isEnabled = true, position = "Bottom" }, isOptional = true },
          { name = "IsQueryContainTimeRange", value = false, isOptional = true },
        ]
        type     = "Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart"
        settings = { content = { PartTitle = t.title, PartSubTitle = t.sub } }
      }
    }
  }

  dashboard = {
    lenses = {
      "0" = { order = 0, parts = merge(local.header, local.query_parts) }
    }
    metadata = {
      model = {
        timeRange = {
          value = { relative = { duration = 24, timeUnit = 1 } }
          type  = "MsPortalFx.Composition.Configuration.ValueTypes.TimeRange"
        }
        filterLocale = { value = "en-us" }
        filters = {
          value = {
            MsPortalFx_TimeRange = {
              model          = { format = "utc", granularity = "auto", relative = "7d" }
              displayCache   = { name = "UTC Time", value = "Past 7 days" }
              filteredPartIds = []
            }
          }
        }
      }
    }
  }
}

resource "azurerm_portal_dashboard" "this" {
  name                 = var.name
  resource_group_name  = var.resource_group_name
  location             = var.location
  dashboard_properties = jsonencode(local.dashboard)
  tags                 = merge(var.tags, { "hidden-title" = var.title })
}
