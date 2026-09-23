import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { PlacesAutocompleteInput } from "@/components/community/PlacesAutocompleteInput";
import {
  ALLOWED_THUMBNAIL_TYPES,
  CREATOR_TYPES,
  DURATION_UNITS,
  FUNDING_STATUSES,
  MAX_THUMBNAIL_BYTES,
  PROXIMITIES,
  Project,
  TEAM_ROLES,
  THUMBNAIL_BUCKET,
  signedThumbnailUrl,
} from "@/lib/projects";
import { X } from "lucide-react";

export interface MemberOption {
  user_id: string;
  display_name: string;
}

interface Props {
  project?: Project | null;
  coCreatorIds?: string[];
  members: MemberOption[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export default function ProjectForm({ project, coCreatorIds = [], members, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const isEdit = !!project;
  const isCreator = !project || project.creator_id === user?.id;

  const [name, setName] = useState(project?.name ?? "");
  const [locationLabel, setLocationLabel] = useState(project?.location_label ?? "");
  const [proximity, setProximity] = useState(project?.proximity ?? "");
  const [url, setUrl] = useState(project?.url ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [durationValue, setDurationValue] = useState(String(project?.duration_value ?? ""));
  const [durationUnit, setDurationUnit] = useState(project?.duration_unit ?? "months");
  const [fundingStatus, setFundingStatus] = useState(project?.funding_status ?? "");
  const [types, setTypes] = useState<string[]>(project?.seeking_creator_types ?? []);
  const [roles, setRoles] = useState<string[]>(project?.seeking_team_roles ?? []);
  const [skills, setSkills] = useState(project?.seeking_skills ?? "");
  const [otherInfo, setOtherInfo] = useState(project?.other_info ?? "");
  const [creatorId, setCreatorId] = useState(project?.creator_id ?? user?.id ?? "");
  const [coCreators, setCoCreators] = useState<string[]>(coCreatorIds);
  const [thumbPath, setThumbPath] = useState<string | null>(project?.thumbnail_url ?? null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    signedThumbnailUrl(thumbPath).then((u) => { if (active) setThumbPreview(u); });
    return () => { active = false; };
  }, [thumbPath]);

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Member";

  const memberMatches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => m.user_id !== creatorId && !coCreators.includes(m.user_id))
      .filter((m) => m.display_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [memberQuery, members, coCreators, creatorId]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (!ALLOWED_THUMBNAIL_TYPES.includes(f.type)) {
      toast({ title: "Unsupported image", description: "Please use a JPG, PNG or WebP image.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_THUMBNAIL_BYTES) {
      toast({ title: "Image too large", description: "Thumbnails must be 5 MB or smaller.", variant: "destructive" });
      return;
    }
    setFile(f);
    setThumbPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !locationLabel.trim() || !proximity || !description.trim() || !startDate || !durationValue || !fundingStatus) {
      toast({ title: "Missing details", description: "Please complete every required field.", variant: "destructive" });
      return;
    }
    if (!thumbPath && !file) {
      toast({ title: "Thumbnail required", description: "Please add a project image.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let path = thumbPath;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const next = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(THUMBNAIL_BUCKET).upload(next, file, { upsert: false });
        if (upErr) throw upErr;
        path = next;
      }

      const payload = {
        name: name.trim(),
        thumbnail_url: path,
        location_label: locationLabel.trim(),
        proximity,
        url: url.trim() || null,
        description: description.trim(),
        start_date: startDate,
        duration_value: Number(durationValue),
        duration_unit: durationUnit,
        funding_status: fundingStatus,
        seeking_creator_types: types,
        seeking_team_roles: roles,
        seeking_skills: skills.trim() || null,
        other_info: otherInfo.trim() || null,
      };

      let projectId = project?.id ?? "";
      if (isEdit) {
        const update: Record<string, unknown> = { ...payload };
        // Only the original creator may hand the project to someone else.
        if (isCreator && creatorId !== project!.creator_id) update.creator_id = creatorId;
        const { error } = await supabase.from("projects" as any).update(update).eq("id", project!.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("projects" as any)
          .insert({ ...payload, creator_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        projectId = (data as any).id;
      }

      const added = coCreators.filter((id) => !coCreatorIds.includes(id));
      const removed = coCreatorIds.filter((id) => !coCreators.includes(id));
      if (added.length) {
        const { error } = await supabase
          .from("project_co_creators" as any)
          .insert(added.map((id) => ({ project_id: projectId, user_id: id, added_by: user.id })));
        if (error) throw error;
      }
      if (removed.length) {
        // Removal is creator-only; the database enforces this too.
        const { error } = await supabase
          .from("project_co_creators" as any)
          .delete()
          .eq("project_id", projectId)
          .in("user_id", removed);
        if (error) throw error;
      }

      toast({ title: isEdit ? "Project updated" : "Project created" });
      onSaved(projectId);
    } catch (err: any) {
      toast({ title: "Couldn't save the project", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Project Thumbnail Image *</Label>
        {thumbPreview && (
          <img src={thumbPreview} alt="Project thumbnail" className="h-32 w-full max-w-xs rounded-md object-cover border border-border" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_THUMBNAIL_TYPES.join(",")}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          {thumbPreview ? "Change image" : "Upload image"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-name">Project Name *</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Project Creator *</Label>
        {isCreator && isEdit ? (
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            aria-label="Project Creator"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value={project!.creator_id}>{nameOf(project!.creator_id)} (you)</option>
            {coCreators.map((id) => (
              <option key={id} value={id}>{nameOf(id)}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">
            {nameOf(creatorId)}
            {!isCreator && " — only the original creator can change this."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Project Co-Creators</Label>
        <div className="flex flex-wrap gap-2">
          {coCreators.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {nameOf(id)}
              {isCreator && (
                <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => setCoCreators(coCreators.filter((c) => c !== id))}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {coCreators.length === 0 && <span className="text-sm text-muted-foreground">None yet</span>}
        </div>
        <Input
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
          placeholder="Search members to tag…"
          aria-label="Search members to tag"
        />
        {memberMatches.length > 0 && (
          <div className="rounded-md border border-border divide-y divide-border">
            {memberMatches.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                onClick={() => { setCoCreators([...coCreators, m.user_id]); setMemberQuery(""); }}
              >
                {m.display_name}
              </button>
            ))}
          </div>
        )}
        {!isCreator && coCreators.length > 0 && (
          <p className="text-xs text-muted-foreground">Only the original creator can remove a co-creator.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-loc">Project Origin/Location *</Label>
        <PlacesAutocompleteInput id="p-loc" value={locationLabel} onChange={setLocationLabel} placeholder="City, country" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-prox">Proximity *</Label>
        <select
          id="p-prox"
          value={proximity}
          onChange={(e) => setProximity(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          required
        >
          <option value="">Select…</option>
          {PROXIMITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-url">Project URL</Label>
        <Input id="p-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-desc">Project Description *</Label>
        <Textarea id="p-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-start">Project Start Date *</Label>
          <Input id="p-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-dur">Project Duration *</Label>
          <div className="flex gap-2">
            <Input
              id="p-dur"
              type="number"
              min={1}
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              className="w-24"
              required
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value)}
              aria-label="Duration unit"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {DURATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-fund">Funding Status *</Label>
        <select
          id="p-fund"
          value={fundingStatus}
          onChange={(e) => setFundingStatus(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          required
        >
          <option value="">Select…</option>
          {FUNDING_STATUSES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Seeking Creator Types</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CREATOR_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <Checkbox checked={types.includes(t)} onCheckedChange={() => toggle(types, setTypes, t)} aria-label={t} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Seeking Team Roles</legend>
        <div className="flex flex-wrap gap-4">
          {TEAM_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggle(roles, setRoles, r)} aria-label={r} />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="p-skills">Seeking Skills</Label>
        <Textarea id="p-skills" rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="What skills is this project looking for?" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-other">Other Project Information</Label>
        <Textarea id="p-other" rows={3} value={otherInfo} onChange={(e) => setOtherInfo(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Project" : "Create Project"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
