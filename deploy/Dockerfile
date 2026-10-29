# 静态站镜像：只有一份产物和一份容器内配置。
#
# 站点由 scripts/site 生成，产物提交在 docs/site；这个镜像不做构建，
# 因此镜像可复现、layer 可缓存，CI 里的「产物 == 生成器输出」是唯一校验点。
#
# 构建上下文是仓库根目录：
#   docker build -f deploy/Dockerfile -t mas-router-site:<tag> .
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY docs/site/ /usr/share/nginx/html/

# 文件在运行时永远只读；把 owner 交给 101，并去掉写位。
RUN chown -R 101:101 /usr/share/nginx/html \
 && chmod -R a-w /usr/share/nginx/html

USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT

# 官方镜像的 entrypoint 脚本会尝试改写配置目录，只读 + 非 root 下没有必要，
# 直接启动 nginx。
ENTRYPOINT ["nginx", "-g", "daemon off;"]
