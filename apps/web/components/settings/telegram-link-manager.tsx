'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bot, Check, Copy, Key, Loader2, RefreshCw, Trash2, Clock } from 'lucide-react';

export interface TelegramLinkItem {
  id: string;
  chatId: string;
  createdAt: string;
}

export interface GeneratedCodeData {
  code: string;
  expiresAt: string;
  command: string;
}

export function TelegramLinkManager() {
  const t = useTranslations('settings.telegram');
  const { toast } = useToast();

  const [links, setLinks] = useState<TelegramLinkItem[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCodeData | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setIsLoadingLinks(true);
    try {
      const response = await api.get('/telegram/links');
      const data = response.data?.data ?? response.data ?? [];
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      // Don't toast error on 404 or empty state
      setLinks([]);
    } finally {
      setIsLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleGenerateCode = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post('/telegram/link-code');
      const data = response.data?.data ?? response.data;
      if (data && data.code) {
        setGeneratedCode({
          code: data.code,
          expiresAt: data.expiresAt,
          command: data.command || `/link ${data.code}`,
        });
        toast({
          title: t('codeGenerated'),
          description: t('expiresIn'),
        });
      }
    } catch (err: unknown) {
      toast({
        title: t('errorGenerating'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode.command);
      setIsCopied(true);
      toast({
        title: t('copied'),
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is unavailable
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleUnlink = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('unlinkConfirm'))) {
      return;
    }
    setUnlinkingId(id);
    try {
      await api.delete(`/telegram/links/${id}`);
      toast({
        title: t('unlinkSuccess'),
      });
      await fetchLinks();
    } catch (err: unknown) {
      toast({
        title: t('errorUnlinking'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
          </div>
          <Button
            onClick={fetchLinks}
            variant="ghost"
            size="sm"
            disabled={isLoadingLinks}
            title={t('actions')}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingLinks ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Code Generation Section */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                {t('generateCode')}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t('expiresIn')}</p>
            </div>
            <Button
              onClick={handleGenerateCode}
              disabled={isGenerating}
              data-testid="generate-telegram-link-code-button"
              className="gap-2 shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  {t('generateCode')}
                </>
              )}
            </Button>
          </div>

          {generatedCode && (
            <div className="rounded-md bg-muted/60 p-4 border border-border/80 space-y-3 animate-in fade-in duration-200">
              <p className="text-xs font-medium text-foreground">{t('codeInstruction')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-background px-3 py-1.5 font-mono text-base font-bold tracking-wider text-primary border shadow-sm">
                  {generatedCode.command}
                </code>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  data-testid="copy-telegram-command-button"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      {t('copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      {t('copyCommand')}
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{t('expiresIn')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Active Links Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              {t('activeLinks')}
            </h3>
            {links.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {links.length}
              </Badge>
            )}
          </div>

          {isLoadingLinks ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin me-2" />
              {t('activeLinks')}...
            </div>
          ) : links.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('noLinks')}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('chatId')}</TableHead>
                    <TableHead>{t('linkedAt')}</TableHead>
                    <TableHead className="text-end">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-mono text-xs">{link.chatId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(link.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnlink(link.id)}
                          disabled={unlinkingId === link.id}
                          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`unlink-telegram-button-${link.id}`}
                        >
                          {unlinkingId === link.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          <span className="ms-1 text-xs">
                            {unlinkingId === link.id ? t('unlinking') : t('unlink')}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
