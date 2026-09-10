<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  pending: boolean
  statusKnown: boolean
  errorMessage?: string
}>()

const emit = defineEmits<{
  accept: []
  close: []
}>()

const accepted = ref(false)
const checkbox = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) {
    accepted.value = false
    return
  }
  await nextTick()
  checkbox.value?.focus()
})

function close() {
  if (!props.pending)
    emit('close')
}

function accept() {
  if (accepted.value && !props.pending)
    emit('accept')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="agreement-fade">
      <div v-if="open" class="agreement-backdrop" @keydown.esc="close">
        <section
          class="agreement-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="charity-agreement-title"
          aria-describedby="charity-agreement-description"
        >
          <button class="dialog-close" type="button" aria-label="关闭授权提示" :disabled="pending" @click="close">
            <span class="i-carbon-close" />
          </button>

          <header>
            <span class="dialog-emblem" aria-hidden="true">
              <span class="i-carbon-sprout" />
            </span>
            <div>
              <small>腾讯公益平台 · 账号授权</small>
              <h2 id="charity-agreement-title">
                参与公益小红花前需完成授权
              </h2>
            </div>
          </header>

          <div id="charity-agreement-description" class="agreement-copy">
            <p>
              你需要使用当前登录账号对应的腾讯公益平台账号参与活动。如果尚无腾讯公益平台账号，同意后将使用当前登录账号注册，并同步必要的账号信息至腾讯公益平台。
            </p>
            <div class="status-note" :class="{ uncertain: !statusKnown }">
              <span :class="statusKnown ? 'i-carbon-information' : 'i-carbon-warning-alt'" />
              <span v-if="statusKnown">检测到当前账号尚未完成公益平台授权。确认成功后会自动刷新本活动。</span>
              <span v-else>当前未读取到活动详情，可能尚未完成公益平台授权。确认后将提交授权并重新拉取活动状态。</span>
            </div>
          </div>

          <label class="agreement-check" :class="{ checked: accepted }">
            <input ref="checkbox" v-model="accepted" type="checkbox" :disabled="pending">
            <span class="check-mark" aria-hidden="true">
              <span v-if="accepted" class="i-carbon-checkmark" />
            </span>
            <span>
              我已阅读并同意
              <a href="https://ssl.gongyi.qq.com/weixin/protocol.html?type=plat" target="_blank" rel="noopener noreferrer">《腾讯公益平台用户服务协议》</a>
              和
              <a href="https://ssl.gongyi.qq.com/weixin/protocol.html?id=24215" target="_blank" rel="noopener noreferrer">《腾讯公益平台隐私保护指引》</a>
            </span>
          </label>

          <p v-if="errorMessage" class="agreement-error" role="alert">
            <span class="i-carbon-warning" />
            {{ errorMessage }}
          </p>

          <footer>
            <p>
              关闭不会提交授权；只有勾选并确认后才会发送请求。
            </p>
            <div>
              <button type="button" class="secondary" :disabled="pending" @click="close">
                暂不参与
              </button>
              <button type="button" class="primary" :disabled="!accepted || pending" @click="accept">
                <span v-if="pending" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-checkmark-filled" />
                {{ pending ? '授权并刷新中' : '确认并刷新活动' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.agreement-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(19 38 30 / 58%);
  backdrop-filter: blur(8px);
}

.agreement-dialog {
  position: relative;
  width: min(570px, 100%);
  overflow: hidden;
  color: #263a31;
  border: 1px solid rgb(72 127 101 / 24%);
  border-radius: 24px;
  background:
    radial-gradient(circle at 100% 0, rgb(213 240 222 / 82%), transparent 34%),
    linear-gradient(145deg, #fffef9 0%, #f8fbf6 100%);
  box-shadow:
    0 30px 90px rgb(8 28 19 / 28%),
    0 4px 16px rgb(8 28 19 / 12%);
}

.agreement-dialog::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: radial-gradient(rgb(49 112 82 / 8%) 0.8px, transparent 0.8px);
  background-size: 9px 9px;
  content: '';
  pointer-events: none;
  mask-image: linear-gradient(to bottom, black, transparent 40%);
}

.dialog-close {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: #567066;
  border: 1px solid #dbe7df;
  border-radius: 50%;
  background: rgb(255 255 255 / 76%);
  cursor: pointer;
}

.dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 28px 64px 21px 28px;
  border-bottom: 1px solid #e1ebe4;
}

.dialog-emblem {
  display: grid;
  flex: none;
  width: 52px;
  height: 52px;
  place-items: center;
  color: #fff;
  border-radius: 18px 18px 18px 7px;
  background: linear-gradient(145deg, #358460, #195c40);
  box-shadow: 0 10px 24px rgb(30 103 71 / 25%);
  font-size: 25px;
  transform: rotate(-3deg);
}

header small {
  display: block;
  margin-bottom: 4px;
  color: #4e7d67;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

header h2 {
  margin: 0;
  color: #1f352b;
  font-family: 'Noto Serif SC', 'Source Han Serif SC', serif;
  font-size: 22px;
  line-height: 1.35;
}

.agreement-copy {
  position: relative;
  z-index: 1;
  padding: 22px 28px 0;
}

.agreement-copy > p {
  margin: 0;
  color: #43584f;
  font-size: 14px;
  line-height: 1.85;
}

.status-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 16px;
  padding: 11px 13px;
  color: #33614c;
  border: 1px solid #d5e8dc;
  border-radius: 12px;
  background: #f0f8f2;
  font-size: 12px;
  line-height: 1.6;
}

.status-note.uncertain {
  color: #7a5d28;
  border-color: #eadfbe;
  background: #fff9e9;
}

.status-note > span:first-child {
  flex: none;
  margin-top: 2px;
  font-size: 15px;
}

.agreement-check {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin: 18px 28px 0;
  padding: 14px;
  color: #40554c;
  border: 1px solid #dce6df;
  border-radius: 14px;
  background: rgb(255 255 255 / 74%);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.7;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.agreement-check.checked {
  border-color: #70a98d;
  background: #f3faf5;
  box-shadow: 0 0 0 3px rgb(54 132 96 / 8%);
}

.agreement-check input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.check-mark {
  display: grid;
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  place-items: center;
  color: #fff;
  border: 1.5px solid #9bb2a6;
  border-radius: 6px;
  background: #fff;
}

.checked .check-mark {
  border-color: #247455;
  background: #247455;
}

.agreement-check a {
  color: #23804f;
  font-weight: 700;
  text-decoration: none;
}

.agreement-check a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.agreement-error {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 8px;
  margin: 12px 28px 0;
  padding: 10px 12px;
  color: #a23f42;
  border: 1px solid #f0cfd0;
  border-radius: 10px;
  background: #fff2f2;
  font-size: 12px;
  line-height: 1.5;
}

footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 20px;
  padding: 18px 28px 24px;
  border-top: 1px solid #e3ebe5;
}

footer p {
  max-width: 205px;
  margin: 0;
  color: #829088;
  font-size: 11px;
  line-height: 1.55;
}

footer > div {
  display: flex;
  gap: 9px;
}

footer button {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 11px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

footer .secondary {
  color: #5b6f65;
  border: 1px solid #d7e1da;
  background: #fff;
}

footer .primary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #fff;
  border: 1px solid #1e6b4c;
  background: linear-gradient(135deg, #2d8560, #1f684a);
  box-shadow: 0 8px 20px rgb(31 104 74 / 20%);
}

footer button:disabled {
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.48;
}

.agreement-fade-enter-active,
.agreement-fade-leave-active {
  transition: opacity 180ms ease;
}

.agreement-fade-enter-active .agreement-dialog,
.agreement-fade-leave-active .agreement-dialog {
  transition:
    transform 210ms ease,
    opacity 180ms ease;
}

.agreement-fade-enter-from,
.agreement-fade-leave-to {
  opacity: 0;
}

.agreement-fade-enter-from .agreement-dialog,
.agreement-fade-leave-to .agreement-dialog {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}

@media (max-width: 640px) {
  .agreement-backdrop {
    align-items: end;
    padding: 12px;
  }

  .agreement-dialog {
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    border-radius: 20px;
  }

  header {
    padding: 24px 52px 18px 20px;
  }

  .dialog-emblem {
    width: 46px;
    height: 46px;
  }

  header h2 {
    font-size: 19px;
  }

  .agreement-copy {
    padding: 18px 20px 0;
  }

  .agreement-check {
    margin-inline: 20px;
  }

  .agreement-error {
    margin-inline: 20px;
  }

  footer {
    align-items: stretch;
    flex-direction: column;
    padding: 16px 20px 20px;
  }

  footer p {
    max-width: none;
  }

  footer > div,
  footer button {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agreement-fade-enter-active,
  .agreement-fade-leave-active,
  .agreement-fade-enter-active .agreement-dialog,
  .agreement-fade-leave-active .agreement-dialog {
    transition: none;
  }
}
</style>
