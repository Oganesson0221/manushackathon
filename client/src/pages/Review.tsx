import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  ArrowLeft,
  Trophy,
  Target,
  AlertCircle,
  Lightbulb,
  MessageSquare,
  GitBranch,
  Loader2,
  RefreshCw,
  ChevronRight,
  Star,
} from "lucide-react";

// Helper to safely parse JSON array fields from database
// MySQL JSON fields may come as strings in some cases
function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // If it's a non-JSON string, return empty array
    }
  }
  return [];
}

export default function Review() {
  const params = useParams<{ code: string }>();
  const roomCode = params.code?.toUpperCase() || "";

  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: roomData, isLoading } = trpc.room.get.useQuery(
    { roomCode },
    { enabled: !!roomCode },
  );

  const { data: speeches } = trpc.speech.getAll.useQuery(
    { roomId: roomData?.room.id || 0 },
    { enabled: !!roomData?.room.id },
  );

  const { data: feedback, refetch: refetchFeedback } =
    trpc.feedback.get.useQuery(
      { roomId: roomData?.room.id || 0 },
      { enabled: !!roomData?.room.id },
    );

  const { data: argumentNodes, refetch: refetchNodes } =
    trpc.analysis.getArgumentNodes.useQuery(
      { roomId: roomData?.room.id || 0 },
      { enabled: !!roomData?.room.id },
    );

  const generateFeedback = trpc.feedback.generate.useMutation({
    onSuccess: () => {
      toast.success("Feedback generated!");
      refetchFeedback();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate feedback");
    },
  });

  const generateMindmap = trpc.analysis.generateMindmap.useMutation({
    onSuccess: () => {
      toast.success("Argument mindmap generated!");
      refetchNodes();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate mindmap");
    },
  });

  const overallFeedback = feedback?.find((f) => f.feedbackType === "overall");
  const teamFeedback = feedback?.filter((f) => f.feedbackType === "team") || [];
  const individualFeedback =
    feedback?.filter((f) => f.feedbackType === "individual") || [];

  const govArguments =
    argumentNodes?.filter((n) => n.team === "government") || [];
  const oppArguments =
    argumentNodes?.filter((n) => n.team === "opposition") || [];

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user || !roomData) {
    navigate("/");
    return null;
  }

  const { room, participants, motion } = roomData;

  const handleGenerateFeedback = () => {
    if (room.id) {
      generateFeedback.mutate({ roomId: room.id });
    }
  };

  const handleGenerateMindmap = () => {
    if (room.id) {
      generateMindmap.mutate({ roomId: room.id });
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      prime_minister: "Prime Minister",
      deputy_prime_minister: "Deputy Prime Minister",
      government_whip: "Government Whip",
      leader_of_opposition: "Leader of Opposition",
      deputy_leader_of_opposition: "Deputy Leader of Opposition",
      opposition_whip: "Opposition Whip",
    };
    return labels[role] || role;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/lobby">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold text-lg">Debate Review</h1>
              <span className="text-sm text-muted-foreground font-mono">
                {roomCode}
              </span>
            </div>
          </div>
          <Badge
            variant={room.status === "completed" ? "default" : "secondary"}
          >
            {room.status}
          </Badge>
        </div>
      </header>

      <main className="container py-8">
        {/* Motion */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-xl font-semibold">{motion?.motion}</p>
            {motion?.backgroundContext && (
              <p className="text-muted-foreground mt-2">
                {motion.backgroundContext}
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="mindmap">Argument Map</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Winner Card */}
            {overallFeedback?.suggestedWinner && (
              <Card
                className={`border-2 ${
                  overallFeedback.suggestedWinner === "government"
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-red-500 bg-red-500/5"
                }`}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Trophy
                      className={`w-12 h-12 ${
                        overallFeedback.suggestedWinner === "government"
                          ? "text-blue-500"
                          : "text-red-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Suggested Winner
                      </p>
                      <h2 className="text-2xl font-bold capitalize">
                        {overallFeedback.suggestedWinner}
                      </h2>
                      <p className="text-sm mt-1">
                        {overallFeedback.winningReason}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Overall Analysis */}
            {overallFeedback?.overallAnalysis ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Debate Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {overallFeedback.overallAnalysis}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground mb-4">
                    No feedback generated yet. Generate AI feedback to see the
                    debate analysis.
                  </p>
                  <Button
                    onClick={handleGenerateFeedback}
                    disabled={generateFeedback.isPending}
                  >
                    {generateFeedback.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Feedback"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Team Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Government */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <CardTitle className="text-blue-600">Government</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {participants
                      .filter((p) => p.team === "government")
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">
                              {p.user?.name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getRoleLabel(p.speakerRole)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Opposition */}
              <Card className="border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="text-red-600">Opposition</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {participants
                      .filter((p) => p.team === "opposition")
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">
                              {p.user?.name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getRoleLabel(p.speakerRole)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-6">
            {feedback && feedback.length > 0 ? (
              <>
                {/* Team Feedback */}
                <div className="grid md:grid-cols-2 gap-6">
                  {teamFeedback.map((tf) => {
                    const strongestArgs = parseJsonArray(tf.strongestArguments);
                    const missedResp = parseJsonArray(tf.missedResponses);
                    const improvementsList = parseJsonArray(tf.improvements);

                    return (
                      <Card
                        key={tf.id}
                        className={`border-l-4 ${
                          tf.team === "government"
                            ? "border-l-blue-500"
                            : "border-l-red-500"
                        }`}
                      >
                        <CardHeader>
                          <CardTitle className="capitalize">
                            {tf.team} Team Feedback
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {strongestArgs.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <Star className="w-4 h-4 text-yellow-500" />
                                Strongest Arguments
                              </h4>
                              <ul className="space-y-1">
                                {strongestArgs.map((arg, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                                    {arg}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {missedResp.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <AlertCircle className="w-4 h-4 text-orange-500" />
                                Missed Responses
                              </h4>
                              <ul className="space-y-1">
                                {missedResp.map((miss, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                                    {miss}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {improvementsList.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-green-500" />
                                Suggestions
                              </h4>
                              <ul className="space-y-1">
                                {improvementsList.map((imp, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-muted-foreground flex items-start gap-2"
                                  >
                                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                                    {imp}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Individual Feedback */}
                <Card>
                  <CardHeader>
                    <CardTitle>Individual Speaker Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {individualFeedback.map((inf) => {
                        const participant = participants.find(
                          (p) => p.id === inf.participantId,
                        );
                        const infStrongest = parseJsonArray(
                          inf.strongestArguments,
                        );
                        const infMissed = parseJsonArray(inf.missedResponses);
                        const infImprovements = parseJsonArray(
                          inf.improvements,
                        );

                        return (
                          <div
                            key={inf.id}
                            className="border-b pb-4 last:border-0"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <Badge
                                variant={
                                  participant?.team === "government"
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {participant?.team}
                              </Badge>
                              <span className="font-medium">
                                {participant?.user?.name} -{" "}
                                {getRoleLabel(participant?.speakerRole || "")}
                              </span>
                            </div>

                            <div className="grid md:grid-cols-3 gap-4 text-sm">
                              {infStrongest.length > 0 && (
                                <div>
                                  <p className="font-medium text-green-600 mb-1">
                                    Strengths
                                  </p>
                                  <ul className="text-muted-foreground space-y-1">
                                    {infStrongest.slice(0, 3).map((s, i) => (
                                      <li key={i}>• {s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {infMissed.length > 0 && (
                                <div>
                                  <p className="font-medium text-orange-600 mb-1">
                                    Missed
                                  </p>
                                  <ul className="text-muted-foreground space-y-1">
                                    {infMissed.slice(0, 3).map((m, i) => (
                                      <li key={i}>• {m}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {infImprovements.length > 0 && (
                                <div>
                                  <p className="font-medium text-blue-600 mb-1">
                                    Improve
                                  </p>
                                  <ul className="text-muted-foreground space-y-1">
                                    {infImprovements
                                      .slice(0, 3)
                                      .map((imp, i) => (
                                        <li key={i}>• {imp}</li>
                                      ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    No feedback available yet. Generate AI feedback to see
                    detailed analysis.
                  </p>
                  <Button
                    onClick={handleGenerateFeedback}
                    disabled={generateFeedback.isPending}
                  >
                    {generateFeedback.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Feedback"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Mindmap Tab */}
          <TabsContent value="mindmap" className="space-y-6">
            {argumentNodes && argumentNodes.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Government Arguments */}
                <Card className="border-l-4 border-l-blue-500">
                  <CardHeader>
                    <CardTitle className="text-blue-600 flex items-center gap-2">
                      <GitBranch className="w-5 h-5" />
                      Government Arguments
                    </CardTitle>
                    <CardDescription>
                      {govArguments.length} points extracted
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {govArguments.map((node) => (
                          <div
                            key={node.id}
                            className="p-3 rounded-lg border bg-card mindmap-node"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {node.nodeType}
                              </Badge>
                              {node.qualityScore && (
                                <div className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-yellow-500" />
                                  <span className="text-xs font-medium">
                                    {node.qualityScore}/10
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium">
                              {node.content}
                            </p>
                            {node.qualityExplanation && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {node.qualityExplanation}
                              </p>
                            )}
                            {node.wasAnswered !== null && (
                              <Badge
                                variant={
                                  node.wasAnswered ? "secondary" : "destructive"
                                }
                                className="mt-2 text-xs"
                              >
                                {node.wasAnswered ? "Answered" : "Unanswered"}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Opposition Arguments */}
                <Card className="border-l-4 border-l-red-500">
                  <CardHeader>
                    <CardTitle className="text-red-600 flex items-center gap-2">
                      <GitBranch className="w-5 h-5" />
                      Opposition Arguments
                    </CardTitle>
                    <CardDescription>
                      {oppArguments.length} points extracted
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {oppArguments.map((node) => (
                          <div
                            key={node.id}
                            className="p-3 rounded-lg border bg-card mindmap-node"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {node.nodeType}
                              </Badge>
                              {node.qualityScore && (
                                <div className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-yellow-500" />
                                  <span className="text-xs font-medium">
                                    {node.qualityScore}/10
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium">
                              {node.content}
                            </p>
                            {node.qualityExplanation && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {node.qualityExplanation}
                              </p>
                            )}
                            {node.wasAnswered !== null && (
                              <Badge
                                variant={
                                  node.wasAnswered ? "secondary" : "destructive"
                                }
                                className="mt-2 text-xs"
                              >
                                {node.wasAnswered ? "Answered" : "Unanswered"}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    No argument map generated yet. Generate the mindmap to
                    visualize debate flow.
                  </p>
                  <Button
                    onClick={handleGenerateMindmap}
                    disabled={
                      generateMindmap.isPending ||
                      !speeches ||
                      speeches.length === 0
                    }
                  >
                    {generateMindmap.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      "Generate Argument Map"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript" className="space-y-6">
            {speeches && speeches.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Full Debate Transcript</CardTitle>
                  <CardDescription>
                    {speeches.length} speeches recorded
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-6">
                      {speeches.map((speech, index) => {
                        const participant = participants.find(
                          (p) => p.id === speech.participantId,
                        );
                        return (
                          <div
                            key={speech.id}
                            className="border-b pb-4 last:border-0"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant={
                                  participant?.team === "government"
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {participant?.team}
                              </Badge>
                              <span className="font-medium">
                                {getRoleLabel(speech.speakerRole)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                (
                                {speech.duration
                                  ? `${Math.floor(speech.duration / 60)}:${(speech.duration % 60).toString().padStart(2, "0")}`
                                  : "N/A"}
                                )
                              </span>
                            </div>
                            {speech.transcript ? (
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {speech.transcript}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                No transcript available
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No speeches recorded for this debate.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
