<template>
  <!--
    根组件：承载路由出口与 Element Plus 全局配置。
    使用 ElConfigProvider 而不是 app.use(ElementPlus)：
      - 前者只做「全局配置（中文 locale）」，组件仍由 unplugin 按需注册，
        体积更小；
      - app.use(ElementPlus) 会把全部组件注册为全局组件，失去按需加载意义。
  -->
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
// 中文语言包：分页、日期选择、上传等组件的内置文案都会跟随切换。
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>
