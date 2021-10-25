import { MyContext } from '../types/MyContext';
import { isEmpty } from 'class-validator';
import {
  Arg,
  Ctx,
  Mutation,
  Query,
  Resolver,
  UseMiddleware
} from 'type-graphql';
import { getRepository } from 'typeorm';
import User from '../entities/User';
import Category from '../entities/Category';
import { AuthenticationError, UserInputError } from 'apollo-server-express';
import { createWriteStream } from 'fs';
import { File, UploadedFileResponse } from '../types/Upload';
import { GraphQLUpload } from 'graphql-upload';
import path from 'path';
import { isAdmin } from '../middleware/isAdmin';

@Resolver()
export class CategoryResolver {
  //创建新类别
  @UseMiddleware(isAdmin)
  @Mutation(() => Category)
  async createCategory(
    @Ctx() { payload }: MyContext,
    @Arg('name') name: string,
    @Arg('desc') desc: string,
    @Arg('bannerUrn') bannerUrn: string
  ) {
    const user = await User.findOne({ id: payload!.userId });

    if (!user) throw new AuthenticationError('认证失败');

    try {
      const errors: any = {};
      if (isEmpty(name)) errors.name = '类名不得为空';

      const isCategory = await getRepository(Category)
        .createQueryBuilder('category')
        .where('lower(category.name)=:name', { name: name.toLowerCase() })
        .getOne();

      if (isCategory) errors.name = '该类名已存在';

      if (Object.keys(errors).length > 0) {
        throw errors;
      }
    } catch (err) {
      return err;
    }

    try {
      const category = new Category({ name, desc, bannerUrn });
      await category.save();
      return category;
    } catch (err) {
      console.log(err);
      return err;
    }
  }

  //获得所有类别
  @Query(() => [Category])
  async listAllCategories() {
    try {
      const categories = await Category.find();
      return categories;
    } catch (err) {
      console.log(err);
      return err;
    }
  }

  //根据类名获得特定类别
  @Query(() => Category)
  async getCategoryByName(@Arg('name') name: string) {
    if (isEmpty(name)) throw new UserInputError('类名不得为空');
    try {
      const category = await Category.findOne({ name });
      return category;
    } catch (err) {
      console.log(err);
      return err;
    }
  }

  //更新类别
  @UseMiddleware(isAdmin)
  @Mutation(() => Category)
  async updateCategory(
    @Ctx() { payload }: MyContext,
    @Arg('oldName') oldName: string,
    @Arg('newName') newName: string,
    @Arg('desc') desc: string,
    @Arg('newBanner', { nullable: false }) newBanner?: string
  ) {
    const user = await User.findOneOrFail({ id: payload!.userId });
    if (!user) throw new AuthenticationError('认证失败');
    try {
      const errors: any = {};
      if (isEmpty(oldName)) errors.oldName = '请输入要替换的类名';
      if (isEmpty(newName)) errors.newName = '类名不得为空';
      if (isEmpty(desc)) errors.desc = '要输入的描述不得为空';

      if (Object.keys(errors).length > 0) throw errors;

      const catToUpd = await Category.findOneOrFail({ name: oldName });

      if (!catToUpd) errors.name = '您要更新的类名不存在，请直接创建';

      if (Object.keys(errors).length > 0) throw errors;

      catToUpd!.name = newName;
      catToUpd!.desc = desc;
      if (newBanner) catToUpd.bannerUrn = newBanner;

      try {
        await catToUpd!.save();
      } catch (err) {
        console.log(err);
        throw err;
      }

      return catToUpd;
    } catch (err) {
      console.log(err);
      return err;
    }
  }

  //上传图片
  @UseMiddleware(isAdmin)
  @Mutation(() => String)
  async uploadCatBanner(
    @Ctx() { payload }: MyContext,
    @Arg('catName') cateName: string,
    @Arg('file', () => GraphQLUpload) { createReadStream, filename }: File
  ): Promise<UploadedFileResponse> {
    const user = await User.findOne({ id: payload!.userId });

    if (!user) throw new AuthenticationError('仅管理员可进行该操作');

    const stream = createReadStream();

    await stream.pipe(
      createWriteStream(
        path.join(__dirname, `/../../../uploads/categories/${filename}`)
      )
    );

    const category = await Category.findOneOrFail({ name: cateName });
    if (!category) throw new Error('未找到要上传封面的话题，请重试');
    category.bannerUrn = `${process.env.BASE_URL}/uploads/categories/${filename}`;
    await category.save();
    return {
      url: `${process.env.BABEL_ENV}/uploads/categories/${filename}`
    };
  }
}
