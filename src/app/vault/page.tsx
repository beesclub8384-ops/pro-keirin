"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, LockKeyhole, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * 사무국장 전용 대납 입력 페이지 (/vault)
 *
 * - 비밀번호는 React state로만 들고 있는다. localStorage/쿠키에 저장하지 않으므로
 *   새로고침하면 다시 입력해야 한다.
 * - Supabase에 직접 접근하지 않고 /api/vault(service role)를 통해서만 읽고 쓴다.
 */

/** ⚠️ src/app/api/vault/route.ts 의 CATEGORIES 와 반드시 동일하게 유지할 것 */
const CATEGORIES = [
  "경조사",
  "임원 및 대의원 지출",
  "낙차위로금",
  "라면 및 용기",
  "제세공과금",
  "감사회의",
  "후보생 지원",
  "환불",
  "재등록비용",
  "임대료",
  "회의 및 미팅 관련 비용",
  "은퇴 관련 비용",
  "기타지출",
  "법률법무",
  "기타",
] as const;

/** 세부분류는 이 성격분류를 선택했을 때만 표시한다 */
const SUB_CATEGORY_PARENT = "임원 및 대의원 지출";

/** ⚠️ src/app/api/vault/route.ts 의 SUB_CATEGORIES 와 반드시 동일하게 유지할 것 */
const SUB_CATEGORIES = ["교통비", "식대", "숙박비", "음료·다과"] as const;

interface DaenapItem {
  id: string | number;
  date: string;
  recipient: string | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  sub_category: string | null;
  photo_url: string | null;
  created_at: string | null;
}

/** 오늘 날짜를 로컬 기준 YYYY-MM-DD로 반환 */
function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "-";
  return amount.toLocaleString("ko-KR");
}

export default function VaultPage() {
  // --- 인증 상태 ---
  const [passwordInput, setPasswordInput] = useState("");
  const [password, setPassword] = useState<string | null>(null); // 인증 성공한 비밀번호
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // --- 목록 상태 ---
  const [items, setItems] = useState<DaenapItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // --- 입력 폼 상태 ---
  const [date, setDate] = useState(todayString);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  /** 목록 새로고침 (인증된 비밀번호 사용) */
  const loadList = useCallback(async (pw: string) => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", password: pw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setListError(json?.error ?? "목록을 불러오지 못했습니다");
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setListError("서버에 연결하지 못했습니다");
    } finally {
      setListLoading(false);
    }
  }, []);

  /** 비밀번호 확인 — list 요청으로 검증하고 성공하면 그 결과를 그대로 목록에 쓴다 */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) {
      setAuthError("비밀번호를 입력해주세요");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", password: passwordInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthError(
          res.status === 401
            ? "비밀번호가 틀렸습니다"
            : (json?.error ?? "확인에 실패했습니다"),
        );
        return;
      }
      setPassword(passwordInput);
      setPasswordInput("");
      setItems(json.items ?? []);
    } catch {
      setAuthError("서버에 연결하지 못했습니다");
    } finally {
      setAuthLoading(false);
    }
  }

  /** 잠그기 — 비밀번호와 조회한 데이터를 메모리에서 비운다 */
  function handleLock() {
    setPassword(null);
    setItems([]);
    setFormError("");
    setFormSuccess("");
  }

  /** 대납 저장 */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setFormError("");
    setFormSuccess("");

    if (!date) return setFormError("날짜를 입력해주세요");
    if (!recipient.trim()) return setFormError("누구에게 지급했는지 입력해주세요");
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return setFormError("금액을 0 이상의 숫자로 입력해주세요");
    }
    if (!category) return setFormError("성격분류를 선택해주세요");

    setSaving(true);
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          password,
          date,
          recipient: recipient.trim(),
          amount: Number(amount),
          description: description.trim(),
          category,
          sub_category: category === SUB_CATEGORY_PARENT ? subCategory : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json?.error ?? "저장에 실패했습니다");
        return;
      }
      // 폼 초기화 (날짜는 오늘로 리셋 — 연속 입력 편의)
      setDate(todayString());
      setRecipient("");
      setAmount("");
      setDescription("");
      setCategory("");
      setSubCategory("");
      setFormSuccess("저장했습니다");
      await loadList(password);
    } catch {
      setFormError("서버에 연결하지 못했습니다");
    } finally {
      setSaving(false);
    }
  }

  /** 성격분류가 '임원 및 대의원 지출'이 아니게 바뀌면 세부분류를 비운다 */
  function handleCategoryChange(value: string) {
    setCategory(value);
    if (value !== SUB_CATEGORY_PARENT) setSubCategory("");
  }

  /** 저장 성공 메시지는 3초 뒤 자동으로 지운다 */
  useEffect(() => {
    if (!formSuccess) return;
    const timer = setTimeout(() => setFormSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [formSuccess]);

  // ---------------------------------------------------------------- 비밀번호 화면
  if (!password) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="size-5" />
              사무국장 전용
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              비밀번호를 입력하면 대납 입력 화면이 열립니다.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Input
                type="password"
                inputMode="text"
                autoComplete="current-password"
                placeholder="비밀번호"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="h-12 text-base"
                autoFocus
              />
              {authError && (
                <p className="text-sm font-medium text-destructive">{authError}</p>
              )}
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={authLoading}>
                {authLoading ? "확인 중..." : "들어가기"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // ---------------------------------------------------------------- 입력 + 목록 화면
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">대납 입력</h1>
        <Button variant="outline" size="sm" onClick={handleLock}>
          <Lock className="size-4" />
          잠그기
        </Button>
      </div>

      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 대납 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-date" className="text-sm font-medium">
                날짜
              </label>
              <Input
                id="vault-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-recipient" className="text-sm font-medium">
                누구에게
              </label>
              <Input
                id="vault-recipient"
                type="text"
                placeholder="예) 홍길동"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-amount" className="text-sm font-medium">
                금액 (원)
              </label>
              <Input
                id="vault-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="예) 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="vault-description" className="text-sm font-medium">
                명목 / 내용
              </label>
              <Input
                id="vault-description"
                type="text"
                placeholder="예) 대의원 회의 교통비"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">성격분류</span>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-12 w-full text-base">
                  <SelectValue placeholder="선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="py-2.5 text-base">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {category === SUB_CATEGORY_PARENT && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">세부분류</span>
                <Select value={subCategory} onValueChange={setSubCategory}>
                  <SelectTrigger className="h-12 w-full text-base">
                    <SelectValue placeholder="선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_CATEGORIES.map((s) => (
                      <SelectItem key={s} value={s} className="py-2.5 text-base">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}
            {formSuccess && (
              <p className="text-sm font-medium text-emerald-600">{formSuccess}</p>
            )}

            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={saving}>
              <Plus className="size-4" />
              {saving ? "저장 중..." : "저장"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            대납 내역 {items.length > 0 && `(${items.length}건)`}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadList(password)}
            disabled={listLoading}
            aria-label="목록 새로고침"
          >
            <RefreshCw className={listLoading ? "size-4 animate-spin" : "size-4"} />
            새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {listError && (
            <p className="mb-3 text-sm font-medium text-destructive">{listError}</p>
          )}
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {listLoading ? "불러오는 중..." : "아직 입력된 대납이 없습니다"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>명목</TableHead>
                  <TableHead>성격</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>{item.recipient ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(item.amount)}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate whitespace-normal">
                      {item.description ?? "-"}
                    </TableCell>
                    <TableCell>
                      {item.category ?? "-"}
                      {item.sub_category ? ` · ${item.sub_category}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
