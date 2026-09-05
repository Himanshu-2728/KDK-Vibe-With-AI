import type Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { computePriority } from "./services/priority.js";
import { haversineMeters } from "./services/geo.js";

const PASSWORD_HASH = bcrypt.hashSync("demo1234", 10);

function iso(daysAgo: number, hoursAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return d.toISOString();
}

/**
 * Real photos for the seeded demo issues (CC-BY / CC-BY-SA works hosted on
 * Wikimedia Commons, served as ~960px thumbnails). The old demo generated
 * SVG stand-ins; real photos make the feed look like an actual city.
 * Hotlinking Commons thumbnails is fine for a demo; self-host before shipping.
 *
 * Sources (all via Wikimedia Commons, geograph images © their photographers):
 *  - pothole.svg:     “Newport Carisbrooke Road pothole 2”
 *  - streetlight.svg: “Broken lamp post, Verhorechye”
 *  - leak.svg:        “Flow from leaking water pipe in Churchland Lane” (geograph)
 *  - garbage.svg:     “Garbage dump 294A0064 São Vicente”
 *  - tree.svg:        “Road blocked by fallen tree” (geograph)
 *  - railing.svg:     “Broken railings over the brook” (geograph)
 *  - after-fix.svg:   “Heavy machines for asphalt pavement in Canada”
 *  - drain.svg:       “Storm drain pushed up through road … Canterbury earthquake”
 *  - sidewalk.svg:    “Broken sidewalk LA”
 *  - light-out.svg:   “Street lamp – Panorama” (Greg Zaal via Poly Haven)
 *  - pothole-elm.svg: “Newport Carisbrooke Road pothole”
 *  - branches.svg:    “Broken tree branch” (geograph)
 *  - trash-pile.svg:  “Illegal dump of building waste” (geograph)
 */
const SEED_IMAGE_URLS: Record<string, string> = {
  "pothole.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Newport_Carisbrooke_Road_pothole_2.JPG/960px-Newport_Carisbrooke_Road_pothole_2.JPG",
  "streetlight.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Broken_lamp_post%2C_Verhorechye.jpg/960px-Broken_lamp_post%2C_Verhorechye.jpg",
  "leak.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Flow_from_leaking_water_pipe_in_Churchland_Lane%2C_Sedlescombe_-_geograph.org.uk_-_7250470.jpg/960px-Flow_from_leaking_water_pipe_in_Churchland_Lane%2C_Sedlescombe_-_geograph.org.uk_-_7250470.jpg",
  "garbage.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Garbage_dump_294A0064_S%C3%A3o_Vicente.jpg/960px-Garbage_dump_294A0064_S%C3%A3o_Vicente.jpg",
  "tree.svg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Road_blocked_by_fallen_tree_-_geograph.org.uk_-_2927837.jpg/960px-Road_blocked_by_fallen_tree_-_geograph.org.uk_-_2927837.jpg",
  "railing.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Broken_railings_over_the_brook_-_geograph.org.uk_-_7065139.jpg/960px-Broken_railings_over_the_brook_-_geograph.org.uk_-_7065139.jpg",
  "after-fix.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Heavy_machines_for_asphalt_pavement_in_Canada.jpg/960px-Heavy_machines_for_asphalt_pavement_in_Canada.jpg",
  "drain.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Storm_drain_pushed_up_through_road_in_the_2010_Canterbury_earthquake.jpg/960px-Storm_drain_pushed_up_through_road_in_the_2010_Canterbury_earthquake.jpg",
  "sidewalk.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Broken_sidewalk_LA.jpg/960px-Broken_sidewalk_LA.jpg",
  "light-out.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Street_lamp_%E2%80%93_Panorama_%28Greg_Zaal_via_Poly_Haven%29.jpg/960px-Street_lamp_%E2%80%93_Panorama_%28Greg_Zaal_via_Poly_Haven%29.jpg",
  "pothole-elm.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Newport_Carisbrooke_Road_pothole.JPG/960px-Newport_Carisbrooke_Road_pothole.JPG",
  "branches.svg":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Broken_tree_branch_-_geograph.org.uk_-_1572547.jpg/960px-Broken_tree_branch_-_geograph.org.uk_-_1572547.jpg",
  "trash-pile.svg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Illegal_dump_of_building_waste_-_geograph.org.uk_-_6562819.jpg/960px-Illegal_dump_of_building_waste_-_geograph.org.uk_-_6562819.jpg",
};

export function seedIfEmpty(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (count.n > 0) return;
  seed(db);
}

function seed(db: Database.Database): void {
  const img = new Map<string, string>(Object.entries(SEED_IMAGE_URLS));

  const insert = db.transaction(() => {
    // --- Users (Indian names — the demo city is Nagpur) ---
    const users: Array<[string, string, string, string]> = [
      ["usr_aisha", "aisha@example.com", "Aisha Khan", "citizen"],
      ["usr_marcus", "rohan@example.com", "Rohan Sharma", "citizen"],
      ["usr_priya", "priya@example.com", "Priya Patel", "citizen"],
      ["usr_jordan", "arjun@example.com", "Arjun Mehta", "citizen"],
      ["usr_sam", "sahil@example.com", "Sahil Verma", "citizen"],
      ["usr_tom", "rahul@city.gov", "Rahul Deshmukh", "authority"],
    ];
    // A pool of 60 extra residents so upvotes come from distinct users
    // (one upvote per user per issue is enforced by the UNIQUE constraint).
    const VOTER_NAMES = [
      "Aarav", "Vihaan", "Aditya", "Arjun", "Rohan", "Kabir", "Dev", "Ishaan", "Kunal", "Manav",
      "Nikhil", "Om", "Parth", "Ravi", "Sameer", "Tarun", "Uday", "Varun", "Yash", "Karan",
      "Aakash", "Harsh", "Mohit", "Pranav", "Siddharth", "Gaurav", "Deepak", "Rahul", "Sanjay", "Amit",
      "Vikram", "Naveen", "Rajesh", "Kiran", "Anil", "Ananya", "Bhavna", "Charu", "Diya", "Esha",
      "Farah", "Gauri", "Hina", "Ira", "Jaya", "Kavya", "Leela", "Mira", "Naina", "Pooja",
      "Riya", "Sana", "Tanvi", "Urvi", "Vidya", "Sneha", "Neha", "Priyanka", "Shreya", "Swati",
    ];
    const insUser = db.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role, avatar_url, created_at) VALUES (?,?,?,?,?,?,?)",
    );
    users.forEach(([id, email, name, role], i) =>
      insUser.run(id, email, PASSWORD_HASH, name, role, null, iso(60 - i * 5)),
    );
    VOTER_NAMES.forEach((name, i) =>
      insUser.run(
        `usr_voter_${i + 1}`,
        `voter${i + 1}@example.com`,
        PASSWORD_HASH,
        name,
        "citizen",
        null,
        iso(50 - i * 0.5),
      ),
    );

    // --- Departments & categories ---
    const departments: Array<[number, string]> = [
      [1, "Roads"],
      [2, "Electrical"],
      [3, "Water"],
      [4, "Waste Management"],
      [5, "Municipal"],
    ];
    const insDept = db.prepare("INSERT INTO departments (id, name) VALUES (?,?)");
    departments.forEach(([id, name]) => insDept.run(id, name));

    const categories: Array<[number, string, string, string, number]> = [
      [1, "Infrastructure", "#2563eb", "🛣", 1],
      [2, "Sanitation", "#7c3aed", "🗑", 4],
      [3, "Water", "#0891b2", "💧", 3],
      [4, "Electrical", "#d97706", "💡", 2],
      [5, "Safety", "#dc2626", "⚠️", 5],
      [6, "Environment", "#16a34a", "🌳", 5],
    ];
    const insCat = db.prepare(
      "INSERT INTO issue_categories (id, name, color, icon, department_id) VALUES (?,?,?,?,?)",
    );
    categories.forEach(([id, name, color, icon, dept]) =>
      insCat.run(id, name, color, icon, dept),
    );

    // --- Issues & reports ---
    // Great Nag Rd pothole: the demo centerpiece — 5 merged reports, trending, CRITICAL.
    const potholeReports: Array<[string, string, string, number, number, number, number]> = [
      ["rep_pothole_aisha", "usr_aisha", "Deep pothole on Great Nag Rd near KDK College, almost wrecked my wheel", 21.1413, 79.12673, 6, 2],
      ["rep_pothole_marcus", "usr_marcus", "Big pothole on Great Nag Rd, cars swerving to avoid it", 21.14145, 79.1268, 5, 14],
      ["rep_pothole_priya", "usr_priya", "Pothole outside KDK College — dangerous for students crossing", 21.14135, 79.12685, 4, 8],
      ["rep_pothole_jordan", "usr_jordan", "Deep pothole near the bus stop on Great Nag Rd", 21.14125, 79.1266, 3, 6],
      ["rep_pothole_sam", "usr_sam", "Another big pothole on Great Nag Rd, getting worse", 21.1414, 79.1267, 2, 10],
    ];

    const insReport = db.prepare(
      "INSERT INTO issue_reports (id, issue_id, user_id, description, latitude, longitude, location_name, created_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    const insIssue = db.prepare(
      `INSERT INTO issues (id, category_id, department_id, status, title, description, latitude, longitude, area_name,
        severity, priority_score, priority_breakdown, report_count, upvote_count, comment_count, ai_result,
        first_reported_at, last_reported_at, resolved_at, confirmed_at, created_at, updated_at)
       VALUES (@id, @category_id, @department_id, @status, @title, @description, @latitude, @longitude, @area_name,
        @severity, @priority_score, @priority_breakdown, @report_count, @upvote_count, @comment_count, @ai_result,
        @first_reported_at, @last_reported_at, @resolved_at, @confirmed_at, @created_at, @updated_at)`,
    );
    const insImage = db.prepare(
      "INSERT INTO issue_images (id, issue_id, report_id, uploader_id, url, thumb_url, kind, created_at) VALUES (?,?,?,?,?,?,?,?)",
    );

    const seedIssue = (issue: {
      id: string;
      categoryId: number;
      departmentId: number;
      status: string;
      title: string;
      description: string;
      lat: number;
      lng: number;
      area: string;
      severity: "low" | "medium" | "high" | "critical";
      upvoteCount: number;
      reportCount: number;
      aiResult: Record<string, unknown> & { safetyRisk?: number; locationImportance?: number };
      firstAt: string;
      lastAt: string;
      resolvedAt: string | null;
      confirmedAt: string | null;
    }) => {
      const breakdown = computePriority({
        severity: issue.severity,
        upvoteCount: issue.upvoteCount,
        reportCount: issue.reportCount,
        safetyRisk: issue.aiResult.safetyRisk ?? 0,
        locationImportance: issue.aiResult.locationImportance ?? 3,
        lastActivityAt: issue.lastAt,
      });
      const info = insIssue.run({
        id: issue.id,
        category_id: issue.categoryId,
        department_id: issue.departmentId,
        status: issue.status,
        title: issue.title,
        description: issue.description,
        latitude: issue.lat,
        longitude: issue.lng,
        area_name: issue.area,
        severity: issue.severity,
        priority_score: breakdown.total,
        priority_breakdown: JSON.stringify(breakdown),
        report_count: issue.reportCount,
        upvote_count: issue.upvoteCount,
        comment_count: 0,
        ai_result: JSON.stringify(issue.aiResult),
        first_reported_at: issue.firstAt,
        last_reported_at: issue.lastAt,
        resolved_at: issue.resolvedAt,
        confirmed_at: issue.confirmedAt,
        created_at: issue.firstAt,
        updated_at: issue.lastAt,
      });
      return info.lastInsertRowid;
    };

    seedIssue({
      id: "iss_oak_pothole",
      categoryId: 1,
      departmentId: 1,
      status: "verified",
      title: "Deep pothole on Great Nag Rd",
      description:
        "Large pothole on Great Nag Rd near KDK College, right at the bus stop. Getting deeper every day — cars are swerving into the other lane.",
      lat: 21.1413,
      lng: 79.12673,
      area: "Nandanvan",
      severity: "high",
      upvoteCount: 47,
      reportCount: 5,
      aiResult: {
        type: "Pothole",
        category: "Infrastructure",
        confidence: 0.88,
        severity: "high",
        explanation:
          "Detected “Pothole” from keywords in your description (“pothole”, “deep”) and the photo (mostly dark, asphalt-like tones; mid-dark pavement tones dominate). Severity estimated high — language suggesting a significant problem. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 8,
        locationImportance: 8,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 mostly dark, asphalt-like tones",
          "📝 description mentions “pothole”",
          "📝 language suggests depth or size (“deep”)",
          "🧩 image tones strongly match “Infrastructure”",
        ],
      },
      firstAt: iso(6, 3),
      lastAt: iso(0, 5),
      resolvedAt: null,
      confirmedAt: null,
    });
    potholeReports.forEach(([id, uid, desc, lat, lng, days, hours]) =>
      insReport.run(id, "iss_oak_pothole", uid, desc, lat, lng, "Great Nag Rd, Nandanvan", iso(days, hours)),
    );
    insImage.run("img_pothole", "iss_oak_pothole", "rep_pothole_aisha", "usr_aisha", img.get("pothole.svg"), img.get("pothole.svg"), "report", iso(6, 3));

    seedIssue({
      id: "iss_streetlight_elm",
      categoryId: 4,
      departmentId: 2,
      status: "assigned",
      title: "Streetlight out on Katol Rd",
      description:
        "Streetlight has been out for a week, the whole stretch of Katol Rd is pitch dark at night. Feels unsafe walking home.",
      lat: 21.14097,
      lng: 79.06243,
      area: "Dharampeth",
      severity: "medium",
      upvoteCount: 12,
      reportCount: 1,
      aiResult: {
        type: "Broken Streetlight",
        category: "Electrical",
        confidence: 0.84,
        severity: "medium",
        explanation:
          "Detected “Broken Streetlight” from keywords in your description (“streetlight”, “dark”). Severity estimated medium. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 4,
        locationImportance: 0,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 very dark frame — little light",
          "📝 description mentions “streetlight”",
          "🧩 dark frame is consistent with an unlit fixture at night",
        ],
      },
      firstAt: iso(4, 6),
      lastAt: iso(0, 20),
      resolvedAt: null,
      confirmedAt: null,
    });
    insReport.run("rep_light_marcus", "iss_streetlight_elm", "usr_marcus", "Streetlight out on Katol Rd, the stretch is pitch dark", 21.14097, 79.06243, "Katol Rd, Dharampeth", iso(4, 6));
    insImage.run("img_streetlight", "iss_streetlight_elm", "rep_light_marcus", "usr_marcus", img.get("streetlight.svg"), img.get("streetlight.svg"), "report", iso(4, 6));

    seedIssue({
      id: "iss_leak_maple",
      categoryId: 3,
      departmentId: 3,
      status: "in_progress",
      title: "Water leaking from main in Ramdaspeth",
      description:
        "Water has been gushing out of the road in Ramdaspeth for two days. The curb is flooding and water is pooling in the gutter.",
      lat: 21.13659,
      lng: 79.07499,
      area: "Ramdaspeth",
      severity: "high",
      upvoteCount: 8,
      reportCount: 1,
      aiResult: {
        type: "Water Leakage",
        category: "Water",
        confidence: 0.9,
        severity: "high",
        explanation:
          "Detected “Water Leakage” from keywords in your description (“water”, “leaking”). Severity estimated high — language suggesting a significant problem. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 0,
        locationImportance: 0,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 strong blue content — standing water or wet surface",
          "📝 description mentions “water”",
          "🧩 blue tones are consistent with pooled water",
        ],
      },
      firstAt: iso(2, 4),
      lastAt: iso(0, 8),
      resolvedAt: null,
      confirmedAt: null,
    });
    insReport.run("rep_leak_priya", "iss_leak_maple", "usr_priya", "Water leaking from main in Ramdaspeth, curb is flooding", 21.13659, 79.07499, "Ramdaspeth", iso(2, 4));
    insImage.run("img_leak", "iss_leak_maple", "rep_leak_priya", "usr_priya", img.get("leak.svg"), img.get("leak.svg"), "report", iso(2, 4));

    seedIssue({
      id: "iss_garbage_park",
      categoryId: 2,
      departmentId: 4,
      status: "ai_analyzed",
      title: "Garbage dumped near Ambazari Lake",
      description:
        "Someone dumped a pile of garbage bags near the Ambazari Lake entrance. It's been there for days and starting to smell.",
      lat: 21.12869,
      lng: 79.04574,
      area: "Ambazari",
      severity: "medium",
      upvoteCount: 3,
      reportCount: 1,
      aiResult: {
        type: "Garbage Dumping",
        category: "Sanitation",
        confidence: 0.91,
        severity: "medium",
        explanation:
          "Detected “Garbage Dumping” from keywords in your description (“garbage”, “dumped”). Severity estimated medium. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 0,
        locationImportance: 3,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 large dark objects against a bright background",
          "📝 description mentions “garbage”",
          "🧩 irregular shapes suggest dumped items, not pavement",
        ],
      },
      firstAt: iso(1, 2),
      lastAt: iso(0, 12),
      resolvedAt: null,
      confirmedAt: null,
    });
    insReport.run("rep_garbage_jordan", "iss_garbage_park", "usr_jordan", "Garbage dumped near the Ambazari Lake entrance", 21.12869, 79.04574, "Ambazari Lake", iso(1, 2));
    insImage.run("img_garbage", "iss_garbage_park", "rep_garbage_jordan", "usr_jordan", img.get("garbage.svg"), img.get("garbage.svg"), "report", iso(1, 2));

    seedIssue({
      id: "iss_tree_highland",
      categoryId: 6,
      departmentId: 5,
      status: "confirmed",
      title: "Fallen tree blocking Manewada Rd",
      description:
        "Large tree came down across Manewada Rd after the storm, blocking one lane completely.",
      lat: 21.11752,
      lng: 79.10448,
      area: "Manewada",
      severity: "medium",
      upvoteCount: 15,
      reportCount: 1,
      aiResult: {
        type: "Fallen Tree",
        category: "Environment",
        confidence: 0.89,
        severity: "medium",
        explanation:
          "Detected “Fallen Tree” from keywords in your description (“tree”, “fallen”). Severity estimated medium. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 0,
        locationImportance: 0,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 strong green content — vegetation",
          "📝 description mentions “tree”",
          "🧩 vegetation tones dominate the frame",
        ],
      },
      firstAt: iso(6, 8),
      lastAt: iso(3, 2),
      resolvedAt: iso(3, 2),
      confirmedAt: iso(2, 1),
    });
    insReport.run("rep_tree_aisha", "iss_tree_highland", "usr_aisha", "Large tree came down across Manewada Rd, blocking a lane", 21.11752, 79.10448, "Manewada Rd, Hanuman Nagar", iso(6, 8));
    insImage.run("img_tree", "iss_tree_highland", "rep_tree_aisha", "usr_aisha", img.get("tree.svg"), img.get("tree.svg"), "report", iso(6, 8));
    insImage.run("img_tree_after", "iss_tree_highland", "rep_tree_aisha", "usr_tom", img.get("after-fix.svg"), img.get("after-fix.svg"), "after_fix", iso(3, 2));

    seedIssue({
      id: "iss_railing_bridge",
      categoryId: 1,
      departmentId: 1,
      status: "reported",
      title: "Broken railing on Gandhi Sagar Bridge",
      description:
        "Section of the pedestrian railing on Gandhi Sagar Bridge is bent and loose after a truck hit it.",
      lat: 21.14579,
      lng: 79.09873,
      area: "Sitabuldi",
      severity: "low",
      upvoteCount: 1,
      reportCount: 1,
      aiResult: {
        type: "Damaged Infrastructure",
        category: "Infrastructure",
        confidence: 0.78,
        severity: "low",
        explanation:
          "Detected “Damaged Infrastructure” from keywords in your description (“railing”, “broken”). Severity estimated low. This is an AI suggestion; please confirm or correct it.",
        safetyRisk: 0,
        locationImportance: 0,
        imageAnalyzed: true,
        signals: [
          "📷 photo analyzed",
          "📷 metallic gray-blue tones",
          "📝 description mentions “broken”",
          "🧩 straight edges suggest railings or metalwork",
        ],
      },
      firstAt: iso(0, 14),
      lastAt: iso(0, 14),
      resolvedAt: null,
      confirmedAt: null,
    });
    insReport.run("rep_railing_sam", "iss_railing_bridge", "usr_sam", "Broken railing on Gandhi Sagar Bridge, section is bent and loose", 21.14579, 79.09873, "Gandhi Sagar Bridge", iso(0, 14));
    insImage.run("img_railing", "iss_railing_bridge", "rep_railing_sam", "usr_sam", img.get("railing.svg"), img.get("railing.svg"), "report", iso(0, 14));

    // --- Upvotes (staggered so the pothole shows velocity) ---
    const insUpvote = db.prepare(
      "INSERT INTO upvotes (id, user_id, issue_id, created_at) VALUES (?,?,?,?)",
    );
    const voter = (i: number) => `usr_voter_${(i % 60) + 1}`;
    let n = 0;
    // Pothole: 47 upvotes from 47 distinct residents, mostly in the last 36h
    // (plus the 5 reporters also upvoted — see below).
    for (let i = 0; i < 47; i++) {
      const hours = 36 - i * 0.75;
      insUpvote.run(`up_ph_${n++}`, voter(i), "iss_oak_pothole", iso(0, Math.max(0.1, hours)));
    }
    // Streetlight: 12 upvotes spread over 4 days.
    for (let i = 0; i < 12; i++) {
      insUpvote.run(`up_el_${n++}`, voter(50 + i), "iss_streetlight_elm", iso(4 - i * 0.3, 2));
    }
    // Water leak: 8 upvotes.
    for (let i = 0; i < 8; i++) {
      insUpvote.run(`up_wl_${n++}`, voter(20 + i), "iss_leak_maple", iso(2 - i * 0.2, 1));
    }
    // Garbage: 3 upvotes.
    for (let i = 0; i < 3; i++) {
      insUpvote.run(`up_gb_${n++}`, voter(35 + i), "iss_garbage_park", iso(1 - i * 0.3, 1));
    }
    // Tree: 15 upvotes over 6 days.
    for (let i = 0; i < 15; i++) {
      insUpvote.run(`up_tr_${n++}`, voter(5 + i), "iss_tree_highland", iso(6 - i * 0.4, 1));
    }
    // Railing: 1 upvote.
    insUpvote.run("up_rb_1", "usr_marcus", "iss_railing_bridge", iso(0, 12));
    // The 5 pothole reporters also upvoted it (distinct users, so allowed).
    insUpvote.run("up_ph_r1", "usr_aisha", "iss_oak_pothole", iso(6, 1));
    insUpvote.run("up_ph_r2", "usr_marcus", "iss_oak_pothole", iso(5, 12));
    insUpvote.run("up_ph_r3", "usr_priya", "iss_oak_pothole", iso(4, 6));
    insUpvote.run("up_ph_r4", "usr_jordan", "iss_oak_pothole", iso(3, 4));
    insUpvote.run("up_ph_r5", "usr_sam", "iss_oak_pothole", iso(2, 2));

    // Sync the denormalized upvote counts with the rows we just inserted.
    db.prepare(
      `UPDATE issues SET upvote_count = (SELECT COUNT(*) FROM upvotes u WHERE u.issue_id = issues.id)`,
    ).run();

    // --- Status history ---
    const insHistory = db.prepare(
      "INSERT INTO issue_status_history (id, issue_id, from_status, to_status, changed_by, note, created_at) VALUES (?,?,?,?,?,?,?)",
    );
    insHistory.run("hist_ph_1", "iss_oak_pothole", "reported", "ai_analyzed", "usr_aisha", "AI analysis complete", iso(6, 2));
    insHistory.run("hist_ph_2", "iss_oak_pothole", "ai_analyzed", "verified", "usr_tom", "Verified — matches 4 nearby reports", iso(1, 4));
    insHistory.run("hist_el_1", "iss_streetlight_elm", "reported", "ai_analyzed", "usr_marcus", "AI analysis complete", iso(4, 5));
    insHistory.run("hist_el_2", "iss_streetlight_elm", "ai_analyzed", "verified", "usr_tom", "Verified on site", iso(3, 2));
    insHistory.run("hist_el_3", "iss_streetlight_elm", "verified", "assigned", "usr_tom", "Assigned to Electrical", iso(2, 5));
    insHistory.run("hist_wl_1", "iss_leak_maple", "reported", "ai_analyzed", "usr_priya", "AI analysis complete", iso(2, 3));
    insHistory.run("hist_wl_2", "iss_leak_maple", "ai_analyzed", "verified", "usr_tom", "Verified — water main leak", iso(1, 20));
    insHistory.run("hist_wl_3", "iss_leak_maple", "verified", "assigned", "usr_tom", "Assigned to Water", iso(1, 18));
    insHistory.run("hist_wl_4", "iss_leak_maple", "assigned", "in_progress", "usr_tom", "Crew dispatched", iso(0, 8));
    insHistory.run("hist_gb_1", "iss_garbage_park", "reported", "ai_analyzed", "usr_jordan", "AI analysis complete", iso(1, 1));
    insHistory.run("hist_tr_1", "iss_tree_highland", "reported", "ai_analyzed", "usr_aisha", "AI analysis complete", iso(6, 7));
    insHistory.run("hist_tr_2", "iss_tree_highland", "ai_analyzed", "verified", "usr_tom", "Verified — tree across road", iso(5, 3));
    insHistory.run("hist_tr_3", "iss_tree_highland", "verified", "assigned", "usr_tom", "Assigned to Municipal", iso(4, 5));
    insHistory.run("hist_tr_4", "iss_tree_highland", "assigned", "in_progress", "usr_tom", "Crew on site", iso(4, 2));
    insHistory.run("hist_tr_5", "iss_tree_highland", "in_progress", "resolved", "usr_tom", "Tree removed, road reopened", iso(3, 2));
    insHistory.run("hist_tr_6", "iss_tree_highland", "resolved", "confirmed", "usr_aisha", "Confirmed fixed by reporter", iso(2, 1));

    // --- Resolutions ---
    db.prepare(
      "INSERT INTO resolutions (id, issue_id, resolved_by, note, after_photo_url, resolved_at, confirmed, confirmed_by, confirmed_at, rejected, rejection_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "res_tree_1", "iss_tree_highland", "usr_tom",
      "Tree removed and the road has been cleared and swept.",
      img.get("after-fix.svg"), iso(3, 2), 1, "usr_aisha", iso(2, 1), 0, null,
    );

    // --- Comments ---
    const insComment = db.prepare(
      "INSERT INTO comments (id, issue_id, user_id, body, upvote_count, created_at) VALUES (?,?,?,?,?,?)",
    );
    insComment.run("cm_ph_1", "iss_oak_pothole", "usr_marcus", "Drove over this this morning — it's getting worse fast.", 4, iso(4, 6));
    insComment.run("cm_ph_2", "iss_oak_pothole", "usr_priya", "This is on the school bus route. Please prioritize it.", 9, iso(3, 10));
    insComment.run("cm_ph_3", "iss_oak_pothole", "usr_jordan", "Saw a van bottom out on it yesterday.", 2, iso(1, 2));
    insComment.run("cm_tr_1", "iss_tree_highland", "usr_aisha", "Thanks to the crew for clearing it so fast!", 6, iso(2, 6));
    // Keep denormalized comment counts in sync with what we just inserted.
    db.prepare(
      `UPDATE issues SET comment_count = (SELECT COUNT(*) FROM comments c WHERE c.issue_id = issues.id)
       WHERE id IN ('iss_oak_pothole','iss_tree_highland')`,
    ).run();

    // --- Notifications ---
    const insNotif = db.prepare(
      "INSERT INTO notifications (id, user_id, type, issue_id, body, read, created_at) VALUES (?,?,?,?,?,?,?)",
    );
    insNotif.run("nt_1", "usr_aisha", "resolved", "iss_tree_highland", "“Fallen tree blocking Manewada Rd” was marked resolved by the city.", 1, iso(3, 1));
    insNotif.run("nt_2", "usr_aisha", "resolution_confirmed", "iss_tree_highland", "Your confirmation was recorded for “Fallen tree blocking Manewada Rd”.", 1, iso(2, 0));
    insNotif.run("nt_3", "usr_aisha", "verified", "iss_oak_pothole", "“Deep pothole on Great Nag Rd” was verified by the city and is now HIGH priority.", 0, iso(1, 4));
    insNotif.run("nt_4", "usr_aisha", "priority_tier_up", "iss_oak_pothole", "“Deep pothole on Great Nag Rd” reached CRITICAL priority — 5 people reported this issue.", 0, iso(0, 20));
    insNotif.run("nt_5", "usr_marcus", "priority_tier_up", "iss_oak_pothole", "“Deep pothole on Great Nag Rd” reached CRITICAL priority.", 0, iso(0, 20));

    // --- Wider city: extra neighborhoods so the map, feed and queue feel real. ---
    const CAT_NAMES: Record<number, string> = { 1: "Infrastructure", 2: "Sanitation", 3: "Water", 4: "Electrical", 5: "Safety", 6: "Environment" };
    const ORDER: string[] = ["reported", "ai_analyzed", "verified", "assigned", "in_progress", "resolved", "confirmed"];
    const extraIssues: Array<{
      id: string; cat: number; status: string; title: string; desc: string;
      lat: number; lng: number; area: string; type: string;
      severity: "low" | "medium" | "high" | "critical"; upvotes: number;
      firstDays: number; lastDays: number; imgFile: string; reporter: string;
      safetyRisk: number; locationImportance: number; confidence: number;
      historyNote: Record<string, string>;
    }> = [
      {
        id: "iss_drain_oldmill", cat: 1, status: "verified",
        title: "Sunken drain cover on Manewada Rd",
        desc: "The drain cover on Manewada Rd has sunk a few inches — delivery vans bottom out on it every morning.",
        lat: 21.1177, lng: 79.1046, area: "Manewada", type: "Sunken Drain",
        severity: "medium", upvotes: 9, firstDays: 8, lastDays: 2, imgFile: "drain.svg",
        reporter: "usr_voter_3", safetyRisk: 0, locationImportance: 3, confidence: 0.84,
        historyNote: { verified: "Verified — matches photos of the sinking cover" },
      },
      {
        id: "iss_leak_oldmill", cat: 3, status: "assigned",
        title: "Water seeping through pavement near Hanuman Nagar",
        desc: "Water has been seeping up through the pavement near Hanuman Nagar for three days.",
        lat: 21.1264, lng: 79.1022, area: "Manewada", type: "Water Leakage",
        severity: "medium", upvotes: 6, firstDays: 5, lastDays: 1, imgFile: "leak.svg",
        reporter: "usr_voter_11", safetyRisk: 0, locationImportance: 0, confidence: 0.88,
        historyNote: { verified: "Verified — moisture on the road surface", assigned: "Assigned to Water" },
      },
      {
        id: "iss_garbage_oldmill", cat: 2, status: "ai_analyzed",
        title: "Waste dumped near Subhash Nagar",
        desc: "Someone dumped old furniture and bags near the vacant lot in Subhash Nagar.",
        lat: 21.1234, lng: 79.0421, area: "Ambazari", type: "Garbage Dumping",
        severity: "low", upvotes: 0, firstDays: 0.6, lastDays: 0.6, imgFile: "trash-pile.svg",
        reporter: "usr_voter_19", safetyRisk: 0, locationImportance: 0, confidence: 0.9,
        historyNote: {},
      },
      {
        id: "iss_sidewalk_hillcrest", cat: 1, status: "reported",
        title: "Cracked sidewalk lifting on Great Nag Rd",
        desc: "Tree roots have cracked and lifted the sidewalk on Great Nag Rd — a trip hazard after dark.",
        lat: 21.1417, lng: 79.1272, area: "Nandanvan", type: "Damaged Infrastructure",
        severity: "medium", upvotes: 2, firstDays: 1, lastDays: 0.2, imgFile: "sidewalk.svg",
        reporter: "usr_voter_27", safetyRisk: 6, locationImportance: 3, confidence: 0.79,
        historyNote: {},
      },
      {
        id: "iss_light_northgate", cat: 4, status: "in_progress",
        title: "Streetlight out at Civil Lines crossing",
        desc: "The light at the Civil Lines crossing is dead — people cross in the dark every morning.",
        lat: 21.155, lng: 79.079, area: "Civil Lines", type: "Broken Streetlight",
        severity: "high", upvotes: 6, firstDays: 4, lastDays: 0.6, imgFile: "light-out.svg",
        reporter: "usr_voter_35", safetyRisk: 8, locationImportance: 8, confidence: 0.86,
        historyNote: { verified: "Verified — light confirmed out", assigned: "Assigned to Electrical", in_progress: "Crew dispatched this morning" },
      },
      {
        id: "iss_tree_lakeside", cat: 6, status: "in_progress",
        title: "Broken branch blocking Ambazari path",
        desc: "A large branch came down across the walking path by Ambazari Lake — joggers are detouring onto the road.",
        lat: 21.1291, lng: 79.046, area: "Ambazari", type: "Fallen Tree",
        severity: "medium", upvotes: 4, firstDays: 3, lastDays: 0.3, imgFile: "branches.svg",
        reporter: "usr_voter_41", safetyRisk: 0, locationImportance: 3, confidence: 0.9,
        historyNote: { verified: "Verified on site", assigned: "Assigned to Municipal", in_progress: "Crew removing the branch" },
      },
      {
        id: "iss_light_lakeside", cat: 4, status: "reported",
        title: "Streetlights out near Bajaj Nagar",
        desc: "The stretch near Bajaj Nagar has been pitch black for a week.",
        lat: 21.1288, lng: 79.0574, area: "Ambazari", type: "Broken Streetlight",
        severity: "medium", upvotes: 1, firstDays: 0.4, lastDays: 0.4, imgFile: "light-out.svg",
        reporter: "usr_voter_47", safetyRisk: 4, locationImportance: 0, confidence: 0.84,
        historyNote: {},
      },
      {
        id: "iss_pothole_elm", cat: 1, status: "reported",
        title: "New pothole opening on Katol Rd",
        desc: "A new pothole is opening up on Katol Rd — still shallow but growing.",
        lat: 21.1405, lng: 79.0619, area: "Dharampeth", type: "Pothole",
        severity: "low", upvotes: 2, firstDays: 0.3, lastDays: 0.3, imgFile: "pothole-elm.svg",
        reporter: "usr_voter_51", safetyRisk: 0, locationImportance: 0, confidence: 0.81,
        historyNote: {},
      },
    ];

    let extraVoterCursor = 4; // distinct reporters already consume a few ids
    for (const ex of extraIssues) {
      const cat = db.prepare("SELECT id, department_id FROM issue_categories WHERE id = ?").get(ex.cat) as { id: number; department_id: number };
      const reportId = `rep_${ex.id}`;
      const reportAt = iso(ex.firstDays, 3);
      const lastAt = iso(ex.lastDays, 1);
      const aiJson = JSON.stringify({
        type: ex.type,
        category: CAT_NAMES[ex.cat],
        confidence: ex.confidence,
        severity: ex.severity,
        explanation: `Detected “${ex.type}” from your description and photo. This is an AI suggestion; please confirm or correct it.`,
        safetyRisk: ex.safetyRisk,
        locationImportance: ex.locationImportance,
        signals: ["📷 photo analyzed"],
        imageAnalyzed: true,
      });
      const breakdown = computePriority({
        severity: ex.severity,
        upvoteCount: ex.upvotes,
        reportCount: 1,
        safetyRisk: ex.safetyRisk,
        locationImportance: ex.locationImportance,
        lastActivityAt: lastAt,
      });
      insIssue.run({
        id: ex.id,
        category_id: ex.cat,
        department_id: cat.department_id,
        status: ex.status,
        title: ex.title,
        description: ex.desc,
        latitude: ex.lat,
        longitude: ex.lng,
        area_name: ex.area,
        severity: ex.severity,
        priority_score: breakdown.total,
        priority_breakdown: JSON.stringify(breakdown),
        report_count: 1,
        upvote_count: ex.upvotes,
        comment_count: 0,
        ai_result: aiJson,
        first_reported_at: reportAt,
        last_reported_at: lastAt,
        resolved_at: null,
        confirmed_at: null,
        created_at: reportAt,
        updated_at: lastAt,
      });
      insReport.run(reportId, ex.id, ex.reporter, ex.desc, ex.lat, ex.lng, ex.area, reportAt);
      db.prepare("UPDATE issue_reports SET ai_result = ? WHERE id = ?").run(aiJson, reportId);
      insImage.run(`img_${ex.id}`, ex.id, reportId, ex.reporter, img.get(ex.imgFile), img.get(ex.imgFile), "report", reportAt);

      // Upvotes from distinct residents, weighted toward the last few days.
      for (let k = 0; k < ex.upvotes; k++) {
        const uid = voter(extraVoterCursor++);
        const hours = 30 - (k / Math.max(1, ex.upvotes)) * 26;
        insUpvote.run(`upx_${ex.id}_${k}`, uid, ex.id, iso(ex.lastDays, Math.max(1, hours)));
      }
      // Sync the denormalized upvote count for this issue.
      db.prepare(
        `UPDATE issues SET upvote_count = (SELECT COUNT(*) FROM upvotes u WHERE u.issue_id = issues.id) WHERE id = ?`,
      ).run(ex.id);

      // Status history leading up to the current status.
      const finalIdx = ORDER.indexOf(ex.status);
      const steps = ORDER.slice(0, finalIdx + 1);
      const notes: Record<string, string> = {
        ai_analyzed: "AI analysis complete",
        ...ex.historyNote,
      };
      for (let i = 0; i < steps.length; i++) {
        const to = steps[i];
        if (to === "reported") continue;
        const from = steps[i - 1]!;
        const frac = i / Math.max(1, steps.length - 1);
        const when = iso(ex.firstDays - (ex.firstDays - ex.lastDays) * frac, 2 + (i % 3));
        insHistory.run(`hist_${ex.id}_${i}`, ex.id, from, to, "usr_tom", notes[to] ?? null, when);
      }
    }
  });

  insert();

  // Cross-check: nearby pothole reports must be within the duplicate radius.
  const rows = db
    .prepare("SELECT latitude, longitude FROM issue_reports WHERE issue_id = 'iss_oak_pothole'")
    .all() as Array<{ latitude: number; longitude: number }>;
  for (const r of rows) {
    const d = haversineMeters(21.1413, 79.12673, r.latitude, r.longitude);
    if (d > 200) console.warn(`seed: pothole report ${d.toFixed(0)}m from anchor (expected <200m)`);
  }
}