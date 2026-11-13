import type { AppActionItem } from './types'

export const APP_ACTIONS_CATALOG: Record<string, AppActionItem[]> = {
  "gmail": [
    {
      "id": "send",
      "name": "Send an email",
      "description": "Compose and send a new message from your Gmail account.",
      "asksFirst": true
    },
    {
      "id": "reply",
      "name": "Reply to a thread",
      "description": "Answer an existing conversation in place.",
      "asksFirst": true
    },
    {
      "id": "read",
      "name": "Read and search mail",
      "description": "Find messages and read them in full, by search or thread.",
      "asksFirst": true
    },
    {
      "id": "labels",
      "name": "Organize with labels",
      "description": "Label a message, and see which labels you already have.",
      "asksFirst": true
    },
    {
      "id": "trash",
      "name": "Move to trash",
      "description": "Trash a message or a whole thread, or pull one back out.",
      "asksFirst": true
    },
    {
      "id": "delete",
      "name": "Delete permanently",
      "description": "Erase a message or thread for good — no undo.",
      "asksFirst": true
    },
    {
      "id": "contacts",
      "name": "Look up contacts",
      "description": "Find someone's address from the contacts on your account.",
      "asksFirst": true
    }
  ],
  "googlecalendar": [
    {
      "id": "create",
      "name": "Create an event",
      "description": "Add a timed event with guests and a location.",
      "asksFirst": true
    },
    {
      "id": "quick-add",
      "name": "Create an all-day event",
      "description": "Add something that takes the whole day.",
      "asksFirst": true
    },
    {
      "id": "read",
      "name": "See your schedule",
      "description": "Read what's on, and find one event in particular.",
      "asksFirst": true
    },
    {
      "id": "free-slots",
      "name": "Find open time",
      "description": "Look for gaps you could book something into.",
      "asksFirst": true
    },
    {
      "id": "update",
      "name": "Update an event",
      "description": "Change the time, the title, or who's invited.",
      "asksFirst": true
    },
    {
      "id": "delete",
      "name": "Delete an event",
      "description": "Take an event off your calendar.",
      "asksFirst": true
    },
    {
      "id": "calendars",
      "name": "Your calendars",
      "description": "See which calendars on the account it can work with.",
      "asksFirst": true
    }
  ],
  "spotify": [
    {
      "id": "playlists",
      "name": "Find your playlists",
      "description": "Browse your playlists and their tracks, including private playlists.",
      "asksFirst": true
    },
    {
      "id": "liked",
      "name": "Find your liked songs",
      "description": "Browse Liked Songs and check whether a track is saved.",
      "asksFirst": true
    },
    {
      "id": "like",
      "name": "Like a song",
      "description": "Save the current song or a specific track to Liked Songs.",
      "asksFirst": true
    },
    {
      "id": "unlike",
      "name": "Remove a liked song",
      "description": "Remove tracks from your Liked Songs.",
      "asksFirst": true
    },
    {
      "id": "create",
      "name": "Create a playlist",
      "description": "Create a public or private playlist in your account.",
      "asksFirst": true
    },
    {
      "id": "edit",
      "name": "Edit your playlists",
      "description": "Add or remove songs and update playlist names and descriptions.",
      "asksFirst": true
    },
    {
      "id": "search",
      "name": "Find music",
      "description": "Search for a song, artist, album, or public playlist.",
      "asksFirst": true
    },
    {
      "id": "playing",
      "name": "Check what is playing",
      "description": "Read the current track, device, volume, and playback settings.",
      "asksFirst": true
    },
    {
      "id": "play",
      "name": "Control playback",
      "description": "Play your music, pause, resume, and skip tracks.",
      "asksFirst": true
    },
    {
      "id": "queue",
      "name": "Manage your queue",
      "description": "See upcoming songs and add a track to your playback queue.",
      "asksFirst": true
    },
    {
      "id": "shuffle",
      "name": "Shuffle and repeat",
      "description": "Turn shuffle on or off and repeat a track or playlist.",
      "asksFirst": true
    },
    {
      "id": "volume",
      "name": "Adjust volume and position",
      "description": "Set the volume or jump to a position in the current track.",
      "asksFirst": true
    },
    {
      "id": "devices",
      "name": "Choose a device",
      "description": "Find available Spotify devices and move playback to one.",
      "asksFirst": true
    }
  ],
  "slack": [
    {
      "id": "send",
      "name": "Send a message",
      "description": "Post to a channel or DM someone directly.",
      "asksFirst": true
    },
    {
      "id": "schedule",
      "name": "Schedule a message",
      "description": "Queue a message to go out at a later time.",
      "asksFirst": true
    },
    {
      "id": "read",
      "name": "Read conversations",
      "description": "Catch up on a channel or a thread you've missed.",
      "asksFirst": true
    },
    {
      "id": "search",
      "name": "Search messages",
      "description": "Find what someone said, across the workspace.",
      "asksFirst": true
    },
    {
      "id": "directory",
      "name": "Find channels and people",
      "description": "Look up a channel or a teammate by name or email.",
      "asksFirst": true
    },
    {
      "id": "dm",
      "name": "Open a DM",
      "description": "Start a direct message with someone.",
      "asksFirst": true
    },
    {
      "id": "reaction",
      "name": "React to a message",
      "description": "Add an emoji reaction to something.",
      "asksFirst": true
    },
    {
      "id": "reminder",
      "name": "Set a Slack reminder",
      "description": "Have Slack nudge you about something later.",
      "asksFirst": true
    },
    {
      "id": "upload",
      "name": "Upload a file",
      "description": "Share a file into a channel or a DM.",
      "asksFirst": true
    }
  ],
  "outlook": [
    {
      "id": "send",
      "name": "Send an email",
      "description": "Compose and send a new message from your account.",
      "asksFirst": true
    },
    {
      "id": "reply",
      "name": "Reply to an email",
      "description": "Answer a message without leaving the thread.",
      "asksFirst": true
    },
    {
      "id": "draft",
      "name": "Draft an email",
      "description": "Write a new draft, or a draft reply, for you to review.",
      "asksFirst": true
    },
    {
      "id": "read",
      "name": "Read and search mail",
      "description": "List, search, and open messages in your mailbox.",
      "asksFirst": true
    },
    {
      "id": "move",
      "name": "Move an email",
      "description": "File it into another folder — deleting means Deleted Items.",
      "asksFirst": true
    },
    {
      "id": "event-create",
      "name": "Create a calendar event",
      "description": "Add an event with a time and attendees.",
      "asksFirst": true
    },
    {
      "id": "event-update",
      "name": "Update a calendar event",
      "description": "Change the time, the title, or the attendees.",
      "asksFirst": true
    },
    {
      "id": "event-delete",
      "name": "Delete a calendar event",
      "description": "Take an event off the calendar.",
      "asksFirst": true
    },
    {
      "id": "event-read",
      "name": "See your schedule",
      "description": "Read your calendar and check when you're free.",
      "asksFirst": true
    },
    {
      "id": "contact-create",
      "name": "Create a contact",
      "description": "Save someone new to your contacts.",
      "asksFirst": true
    },
    {
      "id": "contact-read",
      "name": "Look up contacts",
      "description": "Find someone's details in your contacts.",
      "asksFirst": true
    }
  ],
  "googlesuper": [
    {
      "id": "drive-find",
      "name": "Find files and folders",
      "description": "Search Drive and check what a file is.",
      "asksFirst": true
    },
    {
      "id": "drive-create-file",
      "name": "Create a file",
      "description": "Put a new text file into Drive.",
      "asksFirst": true
    },
    {
      "id": "drive-upload",
      "name": "Upload a file",
      "description": "Send a file from this computer up to Drive.",
      "asksFirst": true
    },
    {
      "id": "drive-download",
      "name": "Download a file",
      "description": "Pull a file down from Drive.",
      "asksFirst": true
    },
    {
      "id": "drive-edit",
      "name": "Edit a file",
      "description": "Change the contents of a file already in Drive.",
      "asksFirst": true
    },
    {
      "id": "drive-share",
      "name": "Share a file",
      "description": "Give someone access to a file or folder.",
      "asksFirst": true
    },
    {
      "id": "drive-delete",
      "name": "Delete a file or folder",
      "description": "Remove it from Drive.",
      "asksFirst": true
    },
    {
      "id": "sheets-create",
      "name": "Create a spreadsheet",
      "description": "Start a new Google Sheet.",
      "asksFirst": true
    },
    {
      "id": "sheets-read",
      "name": "Read a spreadsheet",
      "description": "Find sheets, read cells, and look up rows.",
      "asksFirst": true
    },
    {
      "id": "sheets-write",
      "name": "Update cells and rows",
      "description": "Write values, add rows, or clear a range.",
      "asksFirst": true
    },
    {
      "id": "sheets-structure",
      "name": "Add or remove sheets",
      "description": "Change the tabs, rows, and columns of a spreadsheet.",
      "asksFirst": true
    },
    {
      "id": "sheets-format",
      "name": "Format cells",
      "description": "Change how cells look in a spreadsheet.",
      "asksFirst": true
    },
    {
      "id": "docs-create",
      "name": "Create a document",
      "description": "Start a new Google Doc from text you dictate.",
      "asksFirst": true
    },
    {
      "id": "docs-read",
      "name": "Read a document",
      "description": "Find a doc and read what's in it.",
      "asksFirst": true
    },
    {
      "id": "docs-edit",
      "name": "Edit a document",
      "description": "Insert text, replace it, or rewrite the whole doc.",
      "asksFirst": true
    }
  ],
  "linear": [
    {
      "id": "issue-create",
      "name": "Create an issue",
      "description": "File a new issue on a team, with a title and details.",
      "asksFirst": true
    },
    {
      "id": "issue-update",
      "name": "Update an issue",
      "description": "Change its state, assignee, priority, or description.",
      "asksFirst": true
    },
    {
      "id": "issue-delete",
      "name": "Delete an issue",
      "description": "Move an issue to Linear's trash.",
      "asksFirst": true
    },
    {
      "id": "issue-read",
      "name": "Find issues",
      "description": "Search your team's issues and read one in full.",
      "asksFirst": true
    },
    {
      "id": "comment",
      "name": "Comment on an issue",
      "description": "Add a comment to the thread.",
      "asksFirst": true
    },
    {
      "id": "labels",
      "name": "Manage labels",
      "description": "Create a label, or take one off an issue.",
      "asksFirst": true
    },
    {
      "id": "attachment",
      "name": "Attach a file",
      "description": "Add an attachment to an existing issue.",
      "asksFirst": true
    },
    {
      "id": "teams",
      "name": "Teams and people",
      "description": "Look up a team or a teammate to assign work to.",
      "asksFirst": true
    },
    {
      "id": "projects",
      "name": "Projects and states",
      "description": "See the projects and workflow states you can use.",
      "asksFirst": true
    },
    {
      "id": "cycles",
      "name": "Cycles and sprints",
      "description": "Check which cycle a team is in.",
      "asksFirst": true
    }
  ],
  "jira": [
    {
      "id": "issue-create",
      "name": "Create an issue",
      "description": "File a new issue in a project, with the right fields.",
      "asksFirst": true
    },
    {
      "id": "issue-edit",
      "name": "Edit an issue",
      "description": "Change its summary, description, or fields.",
      "asksFirst": true
    },
    {
      "id": "issue-delete",
      "name": "Delete an issue",
      "description": "Remove an issue from Jira — this can't be undone.",
      "asksFirst": true
    },
    {
      "id": "issue-read",
      "name": "Find issues",
      "description": "Search with JQL and read an issue in full.",
      "asksFirst": true
    },
    {
      "id": "comment",
      "name": "Comment on an issue",
      "description": "Read the discussion, and add to it.",
      "asksFirst": true
    },
    {
      "id": "transition",
      "name": "Move an issue's status",
      "description": "Push it to In Progress, Done, or wherever it goes next.",
      "asksFirst": true
    },
    {
      "id": "assign",
      "name": "Assign an issue",
      "description": "Hand it to someone on the project.",
      "asksFirst": true
    },
    {
      "id": "attachment",
      "name": "Attach a file",
      "description": "Add an attachment to an existing issue.",
      "asksFirst": true
    },
    {
      "id": "projects",
      "name": "Projects",
      "description": "See the projects in this site, and start a new one.",
      "asksFirst": true
    },
    {
      "id": "people",
      "name": "Find people",
      "description": "Resolve a name to the account you want to assign.",
      "asksFirst": true
    },
    {
      "id": "boards",
      "name": "Boards and sprints",
      "description": "See the boards and sprints, and move an issue into one.",
      "asksFirst": true
    }
  ],
  "notion": [
    {
      "id": "read",
      "name": "Search and read",
      "description": "Find a page in your workspace and read what's on it.",
      "asksFirst": false
    },
    {
      "id": "database-read",
      "name": "Query a database",
      "description": "Filter and read rows out of a Notion database.",
      "asksFirst": false
    },
    {
      "id": "page-create",
      "name": "Create a page",
      "description": "Start a new page under a parent you name.",
      "asksFirst": true
    }
  ],
  "canvas": [
    {
      "id": "courses",
      "name": "Your courses",
      "description": "See what you're enrolled in this term.",
      "asksFirst": true
    },
    {
      "id": "assignments",
      "name": "Assignments",
      "description": "Read what's been set, and when it's due.",
      "asksFirst": true
    },
    {
      "id": "grades",
      "name": "Grades and submissions",
      "description": "Check what you've handed in and what came back.",
      "asksFirst": true
    },
    {
      "id": "submit",
      "name": "Submit an assignment",
      "description": "Hand work in, or save it as a draft first.",
      "asksFirst": true
    },
    {
      "id": "todo",
      "name": "What's due next",
      "description": "See your to-do list and what's coming up.",
      "asksFirst": true
    },
    {
      "id": "calendar-read",
      "name": "Course calendar",
      "description": "Read the events on your course calendars.",
      "asksFirst": true
    },
    {
      "id": "calendar-create",
      "name": "Add a calendar event",
      "description": "Put something on your Canvas calendar.",
      "asksFirst": true
    },
    {
      "id": "material",
      "name": "Course material",
      "description": "Work through modules and see recent course activity.",
      "asksFirst": true
    },
    {
      "id": "announcements",
      "name": "Announcements and discussions",
      "description": "Catch up on what instructors and classmates posted.",
      "asksFirst": true
    },
    {
      "id": "discussion-post",
      "name": "Post to a discussion",
      "description": "Reply in a course discussion thread.",
      "asksFirst": true
    },
    {
      "id": "inbox",
      "name": "Your Canvas inbox",
      "description": "Read the messages sitting in Canvas.",
      "asksFirst": true
    },
    {
      "id": "message",
      "name": "Send a message",
      "description": "Message an instructor or a classmate.",
      "asksFirst": true
    },
    {
      "id": "profile",
      "name": "Your profile",
      "description": "Confirm which Canvas account is connected.",
      "asksFirst": true
    }
  ],
  "twitter": [
    {
      "id": "post",
      "name": "Post",
      "description": "Publish a new post from your account.",
      "asksFirst": true
    },
    {
      "id": "like",
      "name": "Like a post",
      "description": "Like someone else's post.",
      "asksFirst": true
    },
    {
      "id": "repost",
      "name": "Repost",
      "description": "Share someone else's post to your followers.",
      "asksFirst": true
    },
    {
      "id": "timeline",
      "name": "Your timeline",
      "description": "Read posts from the accounts you follow.",
      "asksFirst": true
    },
    {
      "id": "search",
      "name": "Search posts",
      "description": "Find recent posts, including your own mentions.",
      "asksFirst": true
    },
    {
      "id": "graph",
      "name": "Followers and following",
      "description": "See who follows an account and who it follows.",
      "asksFirst": true
    },
    {
      "id": "dm-send",
      "name": "Send a DM",
      "description": "Message someone directly.",
      "asksFirst": true
    },
    {
      "id": "dm-read",
      "name": "Read DMs",
      "description": "Catch up on your recent direct messages.",
      "asksFirst": true
    },
    {
      "id": "profile",
      "name": "Look up a profile",
      "description": "Resolve a username or account id to the person behind it.",
      "asksFirst": true
    }
  ],
  "obsidian": [
    {
      "id": "search_notes",
      "name": "Search your vault",
      "description": "Find notes by what's written in them.",
      "asksFirst": true
    },
    {
      "id": "read_note",
      "name": "Read a note",
      "description": "Open one note from the vault.",
      "asksFirst": true
    },
    {
      "id": "create_note",
      "name": "Create a note",
      "description": "Add a new note to the vault.",
      "asksFirst": true
    },
    {
      "id": "append_note",
      "name": "Add to a note",
      "description": "Append text to a note you already have.",
      "asksFirst": true
    }
  ],
  "codex": [
    {
      "id": "dispatch_codex",
      "name": "Start a coding task",
      "description": "Hand a task to Codex in one of your project folders.",
      "asksFirst": true
    },
    {
      "id": "list_coding_tasks",
      "name": "See running tasks",
      "description": "Check which sessions are going and how far along they are.",
      "asksFirst": true
    },
    {
      "id": "get_coding_task",
      "name": "Read a task result",
      "description": "Pull up what a finished session changed and said.",
      "asksFirst": true
    },
    {
      "id": "reply_to_coding_task",
      "name": "Answer a session",
      "description": "Reply by voice when the agent stops to ask you something mid-run.",
      "asksFirst": true
    },
    {
      "id": "dispatch_coding_orchestration",
      "name": "Run several agents at once",
      "description": "Split one job across parallel sessions in the same repo.",
      "asksFirst": true
    },
    {
      "id": "list_coding_orchestrations",
      "name": "See parallel runs",
      "description": "Check the status of every agent in a parallel run.",
      "asksFirst": true
    },
    {
      "id": "get_coding_orchestration",
      "name": "Read a parallel run",
      "description": "Pull up the combined result once the agents finish.",
      "asksFirst": true
    },
    {
      "id": "reply_to_coding_orchestration",
      "name": "Answer a parallel run",
      "description": "Reply to whichever agent in the run is waiting on you.",
      "asksFirst": true
    }
  ],
  "claude-code": [
    {
      "id": "task",
      "name": "Start a coding task",
      "description": "Give Claude Code a task in a project folder.",
      "asksFirst": true
    },
    {
      "id": "prs",
      "name": "Pull requests",
      "description": "Hear the pull requests Claude Code opened and whether checks pass.",
      "asksFirst": true
    },
    {
      "id": "issues",
      "name": "GitHub issues",
      "description": "Check issues assigned to you or in your repository.",
      "asksFirst": true
    },
    {
      "id": "connectors",
      "name": "Claude Code connectors",
      "description": "Manage Claude Code connectors and integrations.",
      "asksFirst": true
    },
    {
      "id": "open",
      "name": "Open in Claude",
      "description": "Open a session in the Claude app.",
      "asksFirst": false
    }
  ],
  "manus": [
    {
      "id": "task",
      "name": "Start a Manus task",
      "description": "Give Manus a goal to research, browse or build.",
      "asksFirst": true
    },
    {
      "id": "status",
      "name": "Check task status",
      "description": "Report whether Manus is running or finished.",
      "asksFirst": false
    },
    {
      "id": "creations",
      "name": "Show creations",
      "description": "Show what Manus built: websites, games and apps.",
      "asksFirst": false
    },
    {
      "id": "publish",
      "name": "Publish a website",
      "description": "Publish a Manus website to go live.",
      "asksFirst": true
    },
    {
      "id": "skills",
      "name": "Manus skills",
      "description": "Show the skills available in your Manus account.",
      "asksFirst": false
    },
    {
      "id": "credits",
      "name": "Manus usage and credits",
      "description": "Check your Manus credit balance and billing.",
      "asksFirst": false
    }
  ]
}

export function getAppActions(appIdOrSlug: string): AppActionItem[] {
  const normalized = appIdOrSlug.toLowerCase().trim()
  return (APP_ACTIONS_CATALOG[normalized] ?? []).map((action) => ({ ...action }))
}
